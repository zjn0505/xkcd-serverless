// Crawler types and interfaces

export interface CrawlTask {
  id: string;
  type: 'xkcd' | 'whatif' | 'localized';
  status: 'pending' | 'running' | 'completed' | 'failed';
  start_time?: Date;
  end_time?: Date;
  progress: number; // 0-100
  total_items?: number;
  processed_items?: number;
  error_message?: string;
  created_at: Date;
  updated_at: Date;
}

export interface CrawlLog {
  id: string;
  task_id: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface CrawlError {
  id: string;
  task_id: string;
  error_type: string;
  error_message: string;
  stack_trace?: string;
  timestamp: Date;
  retry_count: number;
  resolved: boolean;
}

export interface CrawlConfig {
  xkcd: {
    enabled: boolean;
    frequency: string; // cron expression
    batch_size: number;
    max_retries: number;
    timeout: number;
  };
  whatif: {
    enabled: boolean;
    frequency: string;
    batch_size: number;
    max_retries: number;
    timeout: number;
  };
  localized: {
    enabled: boolean;
    frequency: string;
    languages: string[];
    batch_size: number;
    max_retries: number;
    timeout: number;
  };
}

export interface XkcdComicData {
  num: number; // XKCD API uses 'num' instead of 'id'
  title: string;
  alt: string;
  img: string;
  transcript?: string;
  year: number;
  month: number;
  day: number;
  link?: string;
  news?: string;
  safe_title: string;
  width?: number; // Added by getComicData after fetching image dimensions
  height?: number; // Added by getComicData after fetching image dimensions
}

export interface WhatIfArticleData {
  id: number;
  title: string;
  url: string;
  date: string;
}

export interface LocalizedComicData {
  id: number;
  language: string;
  title: string;
  alt?: string;
  img: string;
  transcript?: string;
  source_url?: string;
}

export interface CrawlResult {
  success: boolean;
  items_processed: number;
  items_added: number;
  items_updated: number;
  errors: number;
  duration: number;
  error_details?: string[];
}

export interface CrawlStatus {
  is_running: boolean;
  last_run?: Date;
  next_run?: Date;
  total_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  last_error?: string;
}
