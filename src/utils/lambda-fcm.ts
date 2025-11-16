/**
 * Cloudflare Workers utility for calling AWS Lambda FCM push handler
 * 
 * This provides a simple interface to send FCM notifications via Lambda
 * without needing to handle firebase-admin in Workers.
 */

interface LambdaPushRequest {
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

interface LambdaPushResponse {
  success: boolean;
  result?: any;
  error?: string;
  errorCode?: string;
  timestamp?: string;
}

/**
 * Send FCM notification via AWS Lambda
 * 
 * @param lambdaUrl - Lambda Function URL or API Gateway endpoint
 * @param apiKey - API key for authentication (optional, if using IAM auth)
 * @param payload - Push notification payload
 * @returns Promise with Lambda response
 */
export async function sendNotificationViaLambda(
  lambdaUrl: string,
  apiKey: string | null,
  payload: LambdaPushRequest
): Promise<LambdaPushResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const response = await fetch(lambdaUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorData;
    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { error: errorText };
    }

    throw new Error(
      `Lambda FCM error (${response.status}): ${errorData.error || errorText}`
    );
  }

  return await response.json();
}

/**
 * Send notification to a topic via Lambda
 * Supports both notification + data and data-only messages
 */
export async function sendToTopicViaLambda(
  lambdaUrl: string,
  apiKey: string | null,
  topic: string,
  options: {
    notification?: {
      title: string;
      body: string;
      imageUrl?: string;
    };
    data?: Record<string, string>;
    android?: {
      collapse_key?: string;
      priority?: 'normal' | 'high';
      ttl?: number;
      fcm_options?: {
        analytics_label?: string;
      };
    };
    fcm_options?: {
      analytics_label?: string;
    };
  }
): Promise<LambdaPushResponse> {
  return sendNotificationViaLambda(lambdaUrl, apiKey, {
    topic,
    notification: options.notification,
    data: options.data,
    android: options.android,
    fcm_options: options.fcm_options,
  });
}

/**
 * Send new XKCD comic notification (matches old newComicsForFCM logic)
 */
export async function sendNewComicNotification(
  lambdaUrl: string,
  apiKey: string | null,
  comic: {
    num: number;
    title: string;
    img?: string;
    alt?: string;
    [key: string]: any;
  },
  options?: {
    testMode?: boolean;
    testToken?: string | null;
  }
): Promise<LambdaPushResponse> {
  const data = {
    xkcd: JSON.stringify(comic),
  };
  const androidConfig = {
    collapse_key: 'new_comics',
    priority: 'high' as const,
    ttl: 60 * 60 * 24 * 2 * 1000, // 2 days in milliseconds
    fcm_options: {
      analytics_label: options?.testMode ? `${comic.num}-Android-Test` : `${comic.num}-Android`,
    },
  };
  const fcmOptions = {
    analytics_label: options?.testMode ? `${comic.num}-Test` : `${comic.num}`,
  };

  // If test mode is enabled and test token is provided, send to test token instead of topic
  if (options?.testMode && options?.testToken) {
    return sendNotificationViaLambda(lambdaUrl, apiKey, {
      tokens: [options.testToken],
      data,
      android: androidConfig,
      fcm_options: fcmOptions,
    });
  }

  // Normal mode: send to topic
  return sendToTopicViaLambda(lambdaUrl, apiKey, 'new_comics', {
    data,
    android: androidConfig,
    fcm_options: fcmOptions,
  });
}

/**
 * Send new What If article notification (matches old newWhatIfForFCM logic)
 */
export async function sendNewWhatIfNotification(
  lambdaUrl: string,
  apiKey: string | null,
  article: {
    num: number;
    title: string;
    url?: string;
    date?: string;
    [key: string]: any;
  },
  options?: {
    testMode?: boolean;
    testToken?: string | null;
  }
): Promise<LambdaPushResponse> {
  const data = {
    whatif: JSON.stringify(article),
  };
  const androidConfig = {
    collapse_key: 'new_comics',
    priority: 'high' as const,
    ttl: 60 * 60 * 24 * 7 * 4 * 1000, // 4 weeks in milliseconds
    fcm_options: {
      analytics_label: options?.testMode ? `${article.num}-Android-Test` : `${article.num}-Android`,
    },
  };
  const fcmOptions = {
    analytics_label: options?.testMode ? `${article.num}-Test` : `${article.num}`,
  };

  // If test mode is enabled and test token is provided, send to test token instead of topic
  if (options?.testMode && options?.testToken) {
    return sendNotificationViaLambda(lambdaUrl, apiKey, {
      tokens: [options.testToken],
      data,
      android: androidConfig,
      fcm_options: fcmOptions,
    });
  }

  // Normal mode: send to topic
  return sendToTopicViaLambda(lambdaUrl, apiKey, 'new_what_if', {
    data,
    android: androidConfig,
    fcm_options: fcmOptions,
  });
}

/**
 * Send notification to multiple devices via Lambda
 * Supports batch sending (up to 500 tokens per batch, handled by Lambda)
 */
export async function sendToDevicesViaLambda(
  lambdaUrl: string,
  apiKey: string | null,
  tokens: string[],
  notification: {
    title: string;
    body: string;
    imageUrl?: string;
  },
  data?: Record<string, string>
): Promise<LambdaPushResponse> {
  return sendNotificationViaLambda(lambdaUrl, apiKey, {
    tokens,
    notification,
    data,
  });
}

/**
 * Send notification to a single device via Lambda
 */
export async function sendToDeviceViaLambda(
  lambdaUrl: string,
  apiKey: string | null,
  token: string,
  notification: {
    title: string;
    body: string;
    imageUrl?: string;
  },
  data?: Record<string, string>
): Promise<LambdaPushResponse> {
  return sendNotificationViaLambda(lambdaUrl, apiKey, {
    tokens: [token],
    notification,
    data,
  });
}

