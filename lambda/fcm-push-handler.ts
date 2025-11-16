/**
 * AWS Lambda function for handling FCM push notifications
 * 
 * This Lambda function uses firebase-admin SDK which is fully compatible
 * with Node.js runtime, avoiding Cloudflare Workers limitations.
 * 
 * Deployment:
 * 1. npm install
 * 2. Set FIREBASE_SERVICE_ACCOUNT environment variable (Firebase service account JSON)
 * 3. Deploy using SAM: sam deploy --guided
 * 
 * Cost: Only Lambda invocation costs (free tier: 1M requests/month)
 * - No API Gateway fees (using Function URL)
 * - No Secrets Manager fees (using environment variable)
 * - No CloudWatch Alarm/SNS fees
 */

import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK (cached across Lambda invocations)
// Note: Initialization happens on first invocation, not at module load time
let isInitialized = false;

async function initializeFirebase() {
  if (isInitialized || admin.apps.length > 0) {
    return;
  }

  let serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is required');
  }

  // Support both base64-encoded and plain JSON
  // Try to decode as base64 first, if it fails, treat as plain JSON
  try {
    // Check if it looks like base64 (no spaces, valid base64 chars)
    if (!serviceAccountJson.includes(' ') && /^[A-Za-z0-9+/=]+$/.test(serviceAccountJson)) {
      const decoded = Buffer.from(serviceAccountJson, 'base64').toString('utf-8');
      // If decoded string starts with {, it's likely valid JSON
      if (decoded.trim().startsWith('{')) {
        serviceAccountJson = decoded;
      }
    }
  } catch (error) {
    // If base64 decode fails, treat as plain JSON
    console.log('Treating FIREBASE_SERVICE_ACCOUNT as plain JSON');
  }

  const serviceAccount = JSON.parse(serviceAccountJson);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  
  isInitialized = true;
}

interface PushRequest {
  topic?: string;
  tokens?: string[];
  // Notification is optional - supports data-only messages
  notification?: {
    title: string;
    body: string;
    imageUrl?: string;
  };
  data?: Record<string, string>;
  android?: {
    collapse_key?: string;
    priority?: 'normal' | 'high';
    ttl?: number; // TTL in milliseconds
    sound?: string;
    channelId?: string;
    fcm_options?: {
      analytics_label?: string;
    };
  };
  fcm_options?: {
    analytics_label?: string;
  };
  apns?: {
    sound?: string;
    badge?: number;
  };
}

interface LambdaResponse {
  statusCode: number;
  body: string;
  headers?: Record<string, string>;
}

// Function URL event format
interface FunctionUrlEvent {
  version: string;
  routeKey: string;
  rawPath: string;
  rawQueryString: string;
  headers: Record<string, string>;
  requestContext: {
    accountId: string;
    apiId: string;
    requestId: string;
    time: string;
    timeEpoch: number;
    http: {
      method: string;
      path: string;
      protocol: string;
      sourceIp: string;
      userAgent: string;
    };
  };
  body?: string;
  isBase64Encoded?: boolean;
}

/**
 * Verify API Key from request headers
 */
function verifyApiKey(headers: Record<string, string>): boolean {
  const apiKey = process.env.LAMBDA_API_KEY;
  if (!apiKey) {
    // If no API key is configured, allow all requests (for development)
    return true;
  }

  // Check Authorization header: Bearer <token>
  const authHeader = headers['authorization'] || headers['Authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    return token === apiKey;
  }

  // Check X-API-Key header
  const apiKeyHeader = headers['x-api-key'] || headers['X-API-Key'];
  if (apiKeyHeader) {
    return apiKeyHeader === apiKey;
  }

  return false;
}

/**
 * Parse event - supports both direct invocation and Function URL invocation
 */
function parseEvent(event: any): { pushRequest: PushRequest; isHttpRequest: boolean } {
  // Check if this is a Function URL HTTP request
  if (event.version && event.headers && event.body !== undefined) {
    const httpEvent = event as FunctionUrlEvent;
    
    // Handle non-POST methods
    const requestMethod = httpEvent.requestContext?.http?.method || 'GET';
    if (requestMethod !== 'POST') {
      throw new Error(`Method ${requestMethod} not allowed. Only POST is supported.`);
    }
    
    // Verify API Key
    if (!verifyApiKey(httpEvent.headers)) {
      const apiKeySet = !!process.env.LAMBDA_API_KEY;
      throw new Error(
        apiKeySet 
          ? 'Unauthorized: Invalid or missing API key. Provide Authorization: Bearer <key> or X-API-Key header.'
          : 'Unauthorized: API key validation failed (check Lambda environment configuration)'
      );
    }

    // Parse request body
    let body: PushRequest;
    try {
      body = JSON.parse(httpEvent.body || '{}');
    } catch (error) {
      throw new Error('Invalid JSON in request body');
    }

    return { pushRequest: body, isHttpRequest: true };
  }

  // Direct invocation (for testing)
  return { pushRequest: event as PushRequest, isHttpRequest: false };
}

/**
 * Lambda handler for FCM push notifications
 * 
 * Supports:
 * - Single device (token)
 * - Multiple devices (tokens array, max 500 per batch)
 * - Topic subscription
 * 
 * Authentication:
 * - API Key via Authorization: Bearer <key> header
 * - Or X-API-Key header
 */
export const handler = async (event: any): Promise<LambdaResponse> => {
  // Initialize Firebase Admin SDK on first invocation
  await initializeFirebase();
  
  try {
    // Parse event (supports both Function URL and direct invocation)
    const { pushRequest, isHttpRequest } = parseEvent(event);
    const { topic, tokens, notification, data, android, apns } = pushRequest;

    // Validate input
    if (!topic && (!tokens || tokens.length === 0)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          success: false, 
          error: 'Either topic or tokens must be provided' 
        }),
      };
    }

    // Data-only messages are supported (no notification required)
    if (!data && (!notification || !notification.title || !notification.body)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          success: false, 
          error: 'Either data or notification (with title and body) must be provided' 
        }),
      };
    }

    // Build base message components
    const messageNotification: admin.messaging.Notification | undefined = 
      notification && notification.title && notification.body
        ? {
            title: notification.title,
            body: notification.body,
            imageUrl: notification.imageUrl,
          }
        : undefined;

    const messageData = data as Record<string, string> | undefined;

    // Build Android config with all supported options
    const androidConfig: admin.messaging.AndroidConfig = {
      priority: android?.priority || 'high',
      collapseKey: android?.collapse_key,
      // TTL: convert milliseconds to seconds (firebase-admin expects seconds)
      ttl: android?.ttl ? Math.floor(android.ttl / 1000) : undefined,
      notification: android?.sound || android?.channelId ? {
        sound: android.sound,
        channelId: android.channelId,
      } : undefined,
      fcmOptions: android?.fcm_options?.analytics_label ? {
        analyticsLabel: android.fcm_options.analytics_label,
      } : undefined,
    };

    const apnsConfig: admin.messaging.ApnsConfig = {
      headers: {
        'apns-priority': '10',
      },
      payload: apns ? {
        aps: {
          sound: apns.sound,
          badge: apns.badge,
        },
      } : undefined,
    };

    // Build FCM options (top-level)
    const fcmOptions: admin.messaging.FcmOptions | undefined = 
      pushRequest.fcm_options?.analytics_label
        ? {
            analyticsLabel: pushRequest.fcm_options.analytics_label,
          }
        : undefined;

    let result;

    if (topic) {
      // Send to topic
      console.log(`Sending notification to topic: ${topic}`);
      const topicMessage: any = {
        data: messageData,
        android: androidConfig,
        apns: apnsConfig,
      };
      
      // Add notification if provided
      if (messageNotification) {
        topicMessage.notification = messageNotification;
      }
      
      // Add FCM options if provided
      if (fcmOptions) {
        topicMessage.fcmOptions = fcmOptions;
      }
      
      // sendToTopic accepts Message type, but TypeScript types are incompatible
      // Using 'as any' to work around firebase-admin type definition issues
      const messageId = await admin.messaging().sendToTopic(topic, topicMessage as any);
      result = { messageId, topic };
    } else if (tokens && tokens.length > 0) {
      if (tokens.length === 1) {
        // Single device
        console.log(`Sending notification to single device`);
        const tokenMessage: any = {
          token: tokens[0],
          data: messageData,
          android: androidConfig,
          apns: apnsConfig,
        };
        
        // Add notification if provided
        if (messageNotification) {
          tokenMessage.notification = messageNotification;
        }
        
        // Add FCM options if provided
        if (fcmOptions) {
          tokenMessage.fcmOptions = fcmOptions;
        }
        
        const messageId = await admin.messaging().send(tokenMessage as admin.messaging.TokenMessage);
        result = { messageId, tokens: [tokens[0]] };
      } else {
        // Batch send (max 500 per batch)
        console.log(`Sending notification to ${tokens.length} devices`);
        const batchSize = 500;
        const batches: string[][] = [];
        
        for (let i = 0; i < tokens.length; i += batchSize) {
          batches.push(tokens.slice(i, i + batchSize));
        }

        const batchResults = await Promise.allSettled(
          batches.map(batch => {
            const multicastMessage: any = {
              tokens: batch,
              data: messageData,
              android: androidConfig,
              apns: apnsConfig,
            };
            
            // Add notification if provided
            if (messageNotification) {
              multicastMessage.notification = messageNotification;
            }
            
            // Add FCM options if provided
            if (fcmOptions) {
              multicastMessage.fcmOptions = fcmOptions;
            }
            
            return admin.messaging().sendEachForMulticast(multicastMessage);
          })
        );

        let successCount = 0;
        let failureCount = 0;
        const responses: any[] = [];

        batchResults.forEach((batchResult, index) => {
          if (batchResult.status === 'fulfilled') {
            const value = batchResult.value;
            successCount += value.successCount;
            failureCount += value.failureCount;
            responses.push({
              batch: index + 1,
              successCount: value.successCount,
              failureCount: value.failureCount,
              responses: value.responses,
            });
          } else {
            failureCount += batches[index].length;
            responses.push({
              batch: index + 1,
              error: batchResult.reason?.message || 'Unknown error',
            });
          }
        });

        result = {
          totalTokens: tokens.length,
          successCount,
          failureCount,
          batches: responses,
        };
      }
    }

    const response: LambdaResponse = {
      statusCode: 200,
      body: JSON.stringify({ 
        success: true, 
        result,
        timestamp: new Date().toISOString(),
      }),
    };

    // Add CORS headers for HTTP requests (if needed in future)
    if (isHttpRequest) {
      response.headers = {
        'Content-Type': 'application/json',
      };
    }

    return response;
  } catch (error: unknown) {
    console.error('FCM push error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Handle authentication errors
    let statusCode = 500;
    if (errorMessage.includes('Unauthorized')) {
      statusCode = 401;
    } else if (errorMessage.includes('Invalid JSON')) {
      statusCode = 400;
    } else if (errorMessage.includes('not allowed')) {
      statusCode = 405; // Method Not Allowed
    }

    // Check if error is a Firebase Messaging error
    let errorCode = 'UNKNOWN_ERROR';
    if (error && typeof error === 'object' && 'code' in error) {
      const messagingError = error as { code: string };
      errorCode = messagingError.code;
    }

    const response: LambdaResponse = {
      statusCode,
      body: JSON.stringify({ 
        success: false, 
        error: errorMessage,
        errorCode,
        timestamp: new Date().toISOString(),
      }),
    };

    if (statusCode === 401) {
      response.headers = {
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Bearer',
      };
    }

    return response;
  }
};

