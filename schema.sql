-- XKCD comics data table
CREATE TABLE IF NOT EXISTS comics (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    alt TEXT,
    img TEXT NOT NULL,
    transcript TEXT,
    year INTEGER,
    month INTEGER,
    day INTEGER,
    link TEXT,
    news TEXT,
    safe_title TEXT,
    width INTEGER,
    height INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- What If articles data table
CREATE TABLE IF NOT EXISTS what_if (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    date TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Localized comics data tables (one table per language)
-- Simplified Chinese comics
CREATE TABLE IF NOT EXISTS comics_zh_cn (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    alt TEXT,
    img TEXT NOT NULL,
    transcript TEXT,
    source_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Traditional Chinese comics
CREATE TABLE IF NOT EXISTS comics_zh_tw (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    alt TEXT,
    img TEXT NOT NULL,
    transcript TEXT,
    source_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Spanish comics
CREATE TABLE IF NOT EXISTS comics_es (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    alt TEXT,
    img TEXT NOT NULL,
    transcript TEXT,
    source_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- French comics
CREATE TABLE IF NOT EXISTS comics_fr (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    alt TEXT,
    img TEXT NOT NULL,
    transcript TEXT,
    source_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- German comics
CREATE TABLE IF NOT EXISTS comics_de (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    alt TEXT,
    img TEXT NOT NULL,
    transcript TEXT,
    source_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);


-- Russian comics
CREATE TABLE IF NOT EXISTS comics_ru (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    alt TEXT,
    img TEXT NOT NULL,
    transcript TEXT,
    source_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Like counts table (only store total counts)
CREATE TABLE IF NOT EXISTS like_counts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    comic_id INTEGER NOT NULL,
    comic_type TEXT NOT NULL, -- 'comic' or 'what_if'
    count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(comic_id, comic_type)
);

-- Crawler error records table
CREATE TABLE IF NOT EXISTS crawl_errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    error_type TEXT NOT NULL,
    error_message TEXT NOT NULL,
    stack_trace TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    retry_count INTEGER DEFAULT 0,
    resolved BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (task_id) REFERENCES crawl_tasks(id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_comics_date ON comics(year, month, day);
-- Indexes for localized comics tables (using primary key id)
-- No additional indexes needed as id is already indexed as PRIMARY KEY
CREATE INDEX IF NOT EXISTS idx_like_counts_comic ON like_counts(comic_id, comic_type);
CREATE INDEX IF NOT EXISTS idx_crawl_errors_task_id ON crawl_errors(task_id);
CREATE INDEX IF NOT EXISTS idx_crawl_errors_timestamp ON crawl_errors(timestamp);
