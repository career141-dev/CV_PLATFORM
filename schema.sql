-- Users table (authentication & roles)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  role TEXT DEFAULT 'viewer',
  isApproved BOOLEAN DEFAULT 0,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- CVs table (main data)
CREATE TABLE IF NOT EXISTS cvs (
  id TEXT PRIMARY KEY,
  uploadedBy TEXT NOT NULL,
  fileName TEXT NOT NULL,
  fileType TEXT NOT NULL,
  fileSize INTEGER,
  storageKey TEXT,
  fileHash TEXT,
  
  -- Extracted data
  rawText TEXT,
  candidateName TEXT,
  email TEXT,
  phone TEXT,
  location TEXT,
  currentTitle TEXT,
  industry TEXT,
  sector TEXT,
  seniority TEXT,
  yearsOfExperience INTEGER,
  skills TEXT,
  languages TEXT,
  summary TEXT,
  
  -- Status tracking
  status TEXT DEFAULT 'uploading',
  errorMessage TEXT,
  isStructured BOOLEAN DEFAULT 0,
  workableCandidateId TEXT,
  
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (uploadedBy) REFERENCES users(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_cvs_uploadedBy ON cvs(uploadedBy);
CREATE INDEX IF NOT EXISTS idx_cvs_status ON cvs(status);
CREATE INDEX IF NOT EXISTS idx_cvs_industry ON cvs(industry);
CREATE INDEX IF NOT EXISTS idx_cvs_seniority ON cvs(seniority);

-- Search history table
CREATE TABLE IF NOT EXISTS searchHistory (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  query TEXT NOT NULL,
  resultCount INTEGER,
  results TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (userId) REFERENCES users(id)
);

-- Jobs table
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  postedBy TEXT NOT NULL,
  requirements TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (postedBy) REFERENCES users(id)
);

-- Pipeline table (candidate progress)
CREATE TABLE IF NOT EXISTS pipeline (
  id TEXT PRIMARY KEY,
  jobId TEXT NOT NULL,
  cvId TEXT NOT NULL,
  status TEXT DEFAULT 'applied',
  notes TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (jobId) REFERENCES jobs(id),
  FOREIGN KEY (cvId) REFERENCES cvs(id)
);

-- Approved emails (for access control)
CREATE TABLE IF NOT EXISTS approvedEmails (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  domain TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);
