// TypeScript types for the CV Platform

export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  CACHE: KVNamespace;
  OPENAI_API_KEY: string;
  OPENAI_MODEL: string;
  ENVIRONMENT: string;
}

export interface User {
  id: string;
  email: string;
  name?: string;
  role: 'admin' | 'recruiter' | 'viewer';
  isApproved: boolean;
  createdAt: string;
}

export interface CV {
  id: string;
  uploadedBy: string;
  fileName: string;
  fileType: 'pdf' | 'docx' | 'txt';
  fileSize: number;
  storageKey: string;
  fileHash?: string;
  rawText?: string;
  candidateName?: string;
  email?: string;
  phone?: string;
  location?: string;
  currentTitle?: string;
  industry?: string;
  sector?: string;
  seniority?: 'junior' | 'mid' | 'senior' | 'lead' | 'executive';
  yearsOfExperience?: number;
  skills?: string[];
  languages?: string[];
  summary?: string;
  status: 'uploading' | 'processing' | 'ready' | 'error' | 'paused';
  errorMessage?: string;
  isStructured: boolean;
  workableCandidateId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CVStructuredData {
  candidateName?: string;
  email?: string;
  phone?: string;
  location?: string;
  currentTitle?: string;
  industry?: string;
  sector?: string;
  seniority?: string;
  yearsOfExperience?: number;
  skills?: string[];
  languages?: string[];
  summary?: string;
}

export interface Job {
  id: string;
  title: string;
  description?: string;
  postedBy: string;
  requirements?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Pipeline {
  id: string;
  jobId: string;
  cvId: string;
  status: 'applied' | 'reviewed' | 'interviewed' | 'offered' | 'rejected';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthContext {
  userId?: string;
  user?: User;
  isAuthenticated: boolean;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
