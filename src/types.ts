// 数据库类型定义
export interface Comic {
  id: number;
  title: string;
  alt?: string;
  img: string;
  transcript?: string;
  year?: number;
  month?: number;
  day?: number;
  link?: string;
  news?: string;
  safe_title?: string;
  created_at?: string;
  updated_at?: string;
}

export interface WhatIf {
  id: number;
  title: string;
  url: string;
  date?: string;
  question?: string;
  answer?: string;
  created_at?: string;
  updated_at?: string;
}

export interface LocalizedComic {
  id: number;
  title: string;
  alt?: string;
  img: string;
  transcript?: string;
  source_url?: string;
  created_at?: string;
  updated_at?: string;
}

// Supported languages
export type SupportedLanguage = 'zh-cn' | 'zh-tw' | 'es' | 'fr' | 'de' | 'ru';

export interface LikeCount {
  id: number;
  comic_id: number;
  comic_type: 'comic' | 'what_if';
  count: number;
  created_at?: string;
  updated_at?: string;
}

export interface CrawlTask {
  id: number;
  task_type: 'xkcd' | 'what_if' | 'localized';
  status: 'pending' | 'running' | 'completed' | 'failed';
  last_comic_id?: number;
  total_processed: number;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
  created_at?: string;
}

// API 响应类型
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// 分页参数
export interface PaginationParams {
  start?: number;
  size?: number;
  reversed?: boolean;
}

// 搜索参数
export interface SearchParams {
  q: string;
  size?: number;
}
