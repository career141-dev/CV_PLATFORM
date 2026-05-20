import { Env, CV, CVStructuredData, User } from './types';

// User operations
export async function saveUser(env: Env, user: Partial<User>) {
  const id = user.id || crypto.randomUUID();
  const result = await env.DB.prepare(`
    INSERT INTO users (id, email, name, role, isApproved)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      role = COALESCE(excluded.role, role),
      isApproved = COALESCE(excluded.isApproved, isApproved)
  `).bind(
    id,
    user.email,
    user.name || null,
    user.role || 'viewer',
    user.isApproved ? 1 : 0
  ).run();
  return result;
}

export async function getUser(env: Env, userId: string): Promise<User | null> {
  const result = await env.DB.prepare(
    'SELECT * FROM users WHERE id = ?'
  ).bind(userId).first();
  return result as User | null;
}

export async function getUserByEmail(env: Env, email: string): Promise<User | null> {
  const result = await env.DB.prepare(
    'SELECT * FROM users WHERE email = ?'
  ).bind(email).first();
  return result as User | null;
}

// CV operations
export async function saveCv(env: Env, cv: Partial<CV>): Promise<string> {
  const id = cv.id || crypto.randomUUID();
  const now = new Date().toISOString();
  
  await env.DB.prepare(`
    INSERT INTO cvs (
      id, uploadedBy, fileName, fileType, fileSize, 
      storageKey, rawText, status, isStructured, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    cv.uploadedBy,
    cv.fileName,
    cv.fileType,
    cv.fileSize || 0,
    cv.storageKey || null,
    cv.rawText || null,
    cv.status || 'uploading',
    cv.isStructured ? 1 : 0,
    now,
    now
  ).run();
  
  return id;
}

export async function getCv(env: Env, cvId: string): Promise<CV | null> {
  const result = await env.DB.prepare(
    'SELECT * FROM cvs WHERE id = ?'
  ).bind(cvId).first();
  
  if (result) {
    return parseCV(result as any);
  }
  return null;
}

export async function getCvsByUser(env: Env, userId: string, limit = 100, offset = 0): Promise<CV[]> {
  const results = await env.DB.prepare(`
    SELECT * FROM cvs 
    WHERE uploadedBy = ? 
    ORDER BY createdAt DESC 
    LIMIT ? OFFSET ?
  `).bind(userId, limit, offset).all();
  
  return (results.results || []).map(r => parseCV(r as any));
}

export async function saveCvData(env: Env, cvId: string, data: CVStructuredData): Promise<void> {
  const now = new Date().toISOString();
  
  await env.DB.prepare(`
    UPDATE cvs SET
      candidateName = ?,
      email = ?,
      phone = ?,
      location = ?,
      currentTitle = ?,
      industry = ?,
      sector = ?,
      seniority = ?,
      yearsOfExperience = ?,
      skills = ?,
      languages = ?,
      summary = ?,
      isStructured = 1,
      status = ?,
      updatedAt = ?
    WHERE id = ?
  `).bind(
    data.candidateName || null,
    data.email || null,
    data.phone || null,
    data.location || null,
    data.currentTitle || null,
    data.industry || null,
    data.sector || null,
    data.seniority || null,
    data.yearsOfExperience || null,
    data.skills ? JSON.stringify(data.skills) : null,
    data.languages ? JSON.stringify(data.languages) : null,
    data.summary || null,
    'ready',
    now,
    cvId
  ).run();
}

export async function saveRawText(env: Env, cvId: string, rawText: string): Promise<void> {
  const now = new Date().toISOString();
  
  await env.DB.prepare(`
    UPDATE cvs SET
      rawText = ?,
      status = ?,
      updatedAt = ?
    WHERE id = ?
  `).bind(
    rawText.slice(0, 50000), // Cap at 50k chars
    'ready',
    now,
    cvId
  ).run();
}

export async function updateCvStatus(
  env: Env, 
  cvId: string, 
  status: string, 
  errorMessage?: string
): Promise<void> {
  const now = new Date().toISOString();
  
  await env.DB.prepare(`
    UPDATE cvs SET
      status = ?,
      errorMessage = ?,
      updatedAt = ?
    WHERE id = ?
  `).bind(
    status,
    errorMessage || null,
    now,
    cvId
  ).run();
}

export async function deleteCv(env: Env, cvId: string): Promise<void> {
  await env.DB.prepare(
    'DELETE FROM cvs WHERE id = ?'
  ).bind(cvId).run();
}

export async function searchCvs(
  env: Env,
  query: {
    text?: string;
    skill?: string;
    location?: string;
    seniority?: string;
    industry?: string;
  },
  limit = 50
): Promise<CV[]> {
  let sql = 'SELECT * FROM cvs WHERE status = \'ready\'';
  const params: any[] = [];
  
  if (query.text) {
    const searchTerm = `%${query.text}%`;
    sql += ' AND (candidateName LIKE ? OR currentTitle LIKE ? OR skills LIKE ? OR summary LIKE ? OR rawText LIKE ?)';
    params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
  }
  
  if (query.skill) {
    sql += ' AND skills LIKE ?';
    params.push(`%${query.skill}%`);
  }
  
  if (query.location) {
    sql += ' AND location LIKE ?';
    params.push(`%${query.location}%`);
  }
  
  if (query.seniority) {
    sql += ' AND seniority = ?';
    params.push(query.seniority);
  }
  
  if (query.industry) {
    sql += ' AND industry = ?';
    params.push(query.industry);
  }
  
  sql += ' ORDER BY createdAt DESC LIMIT ?';
  params.push(limit);
  
  const results = await env.DB.prepare(sql).bind(...params).all();
  return (results.results || []).map(r => parseCV(r as any));
}

export async function getPausedCvs(env: Env, userId: string): Promise<CV[]> {
  const results = await env.DB.prepare(`
    SELECT * FROM cvs 
    WHERE uploadedBy = ? AND status = 'paused'
    ORDER BY createdAt ASC
  `).bind(userId).all();
  
  return (results.results || []).map(r => parseCV(r as any));
}

// Helper: Parse CV from database row
function parseCV(row: any): CV {
  return {
    ...row,
    isStructured: row.isStructured === 1,
    skills: row.skills ? JSON.parse(row.skills) : undefined,
    languages: row.languages ? JSON.parse(row.languages) : undefined,
  };
}
