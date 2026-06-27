const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// Load environment variables if available
require('dotenv').config();

const FALLBACK_FILE = path.join(__dirname, 'db_fallback.json');

// Default initial data for fallback JSON (Updated with CodeChef and GitHub)
const DEFAULT_FALLBACK_DATA = {
  users: [
    { username: 'admin@ideal.edu.in', password: 'admin123', role: 'admin', name: 'System Admin', branch: null },
    { username: 'principal@ideal.edu.in', password: 'principal123', role: 'principal', name: 'Principal Office', branch: null },
    { username: 'hod.cse@ideal.edu.in', password: 'hod.cse123', role: 'hod', name: 'CSE HOD', branch: 'CSE' },
    { username: 'hod.csm@ideal.edu.in', password: 'hod.csm123', role: 'hod', name: 'CSM HOD', branch: 'CSM' },
    { username: 'hod.aiml@ideal.edu.in', password: 'hod.aiml123', role: 'hod', name: 'AIML HOD', branch: 'AIML' },
    { username: 'hod.mech@ideal.edu.in', password: 'hod.mech123', role: 'hod', name: 'MECH HOD', branch: 'MECH' },
    { username: 'hod.ece@ideal.edu.in', password: 'hod.ece123', role: 'hod', name: 'ECE HOD', branch: 'ECE' }
  ],
  student_profiles: [],
  audit_logs: [],
  notices: [],
  assignments: [],
  activity_logs: []
};

let pool = null;
let isFallbackMode = false;

// Initialize Database Connection
async function initDb() {
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'code_tracker',
    port: parseInt(process.env.DB_PORT || '3306')
  };

  if (!dbConfig.user) {
    console.warn('\x1b[33m%s\x1b[0m', 'Warning: DB_USER is not set in environment variables. Falling back to local JSON database.');
    setupFallbackFile();
    isFallbackMode = true;
    return;
  }

  try {
    pool = mysql.createPool(dbConfig);
    const conn = await pool.getConnection();
    console.log('\x1b[32m%s\x1b[0m', 'Success: Connected to MySQL database.');
    conn.release();
  } catch (err) {
    console.warn('\x1b[31m%s\x1b[0m', 'Error: Could not connect to MySQL database:', err.message);
    console.warn('\x1b[33m%s\x1b[0m', 'Falling back to local JSON database storage.');
    setupFallbackFile();
    isFallbackMode = true;
  }
}

function setupFallbackFile() {
  if (!fs.existsSync(FALLBACK_FILE)) {
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify(DEFAULT_FALLBACK_DATA, null, 2));
  }
}

function readFallbackData() {
  setupFallbackFile();
  const fileContent = fs.readFileSync(FALLBACK_FILE, 'utf8');
  const data = JSON.parse(fileContent);
  data.users = data.users || [];
  data.student_profiles = data.student_profiles || [];
  data.audit_logs = data.audit_logs || [];
  data.notices = data.notices || [];
  data.assignments = data.assignments || [];
  data.activity_logs = data.activity_logs || [];
  return data;
}

function writeFallbackData(data) {
  fs.writeFileSync(FALLBACK_FILE, JSON.stringify(data, null, 2));
}

const db = {
  isFallback: () => isFallbackMode,

  getUser: async (username) => {
    if (isFallbackMode) {
      const data = readFallbackData();
      const user = data.users.find(u => 
        u.username.toLowerCase() === username.toLowerCase() ||
        (u.email && u.email.toLowerCase() === username.toLowerCase())
      );
      return user || null;
    } else {
      const [rows] = await pool.query('SELECT * FROM users WHERE username = ? OR email = ?', [username, username]);
      return rows[0] || null;
    }
  },

  getAllStudents: async () => {
    if (isFallbackMode) {
      const data = readFallbackData();
      return data.users
        .filter(u => u.role === 'student')
        .map(u => {
          const profile = data.student_profiles.find(p => p.roll === u.username) || {};
          return {
            roll: u.username,
            name: u.name,
            branch: u.branch,
            email: profile.email || '',
            leetcode: profile.leetcode_url || '',
            hackerrank: profile.hackerrank_url || '',
            codeforces: profile.codeforces_url || '',
            gfg: profile.gfg_url || '',
            codechef: profile.codechef_url || '',
            github: profile.github_url || '',
            stats: {
              leetcode: profile.leetcode_solved || 0,
              hackerrank: profile.hackerrank_score || 0,
              codeforces: profile.codeforces_rating || 0,
              gfg: profile.gfg_solved || 0,
              codechef: profile.codechef_solved || 0,
              github: profile.github_repos || 0
            },
            ranks: {
              leetcode: profile.leetcode_rank || 'N/A',
              hackerrank: profile.hackerrank_rank || 'N/A',
              codeforces: profile.codeforces_rank || 'N/A',
              gfg: profile.gfg_rank || 'N/A',
              codechef: profile.codechef_rank || 'N/A',
              github: profile.github_rank || 'N/A'
            },
            totalScore: profile.total_score || 0,
            batchYear: profile.batch_year || 2026
          };
        });
    } else {
      const [rows] = await pool.query(`
        SELECT u.username AS roll, u.name, u.branch, sp.email,
               sp.leetcode_url, sp.hackerrank_url, sp.codeforces_url, sp.gfg_url, sp.codechef_url, sp.github_url,
               sp.leetcode_solved, sp.leetcode_rank, sp.hackerrank_score, sp.hackerrank_rank, sp.codeforces_rating, sp.codeforces_rank,
               sp.gfg_solved, sp.gfg_rank, sp.codechef_solved, sp.codechef_rank, sp.github_repos, sp.github_rank, sp.total_score, sp.batch_year
        FROM users u
        INNER JOIN student_profiles sp ON u.username = sp.roll
        WHERE u.role = 'student'
      `);
      return rows.map(r => ({
        roll: r.roll,
        name: r.name,
        branch: r.branch,
        email: r.email,
        leetcode: r.leetcode_url,
        hackerrank: r.hackerrank_url,
        codeforces: r.codeforces_url,
        gfg: r.gfg_url,
        codechef: r.codechef_url,
        github: r.github_url,
        stats: {
          leetcode: r.leetcode_solved,
          hackerrank: r.hackerrank_score,
          codeforces: r.codeforces_rating,
          gfg: r.gfg_solved,
          codechef: r.codechef_solved,
          github: r.github_repos
        },
        ranks: {
          leetcode: r.leetcode_rank || 'N/A',
          hackerrank: r.hackerrank_rank || 'N/A',
          codeforces: r.codeforces_rank || 'N/A',
          gfg: r.gfg_rank || 'N/A',
          codechef: r.codechef_rank || 'N/A',
          github: r.github_rank || 'N/A'
        },
        totalScore: r.total_score,
        batchYear: r.batch_year
      }));
    }
  },

  registerStudent: async (user, profile) => {
    if (isFallbackMode) {
      const data = readFallbackData();
      if (data.users.some(u => u.username.toLowerCase() === user.username.toLowerCase())) {
        throw new Error('Roll Number already registered.');
      }
      data.users.push({
        username: user.username,
        password: user.password,
        role: 'student',
        name: user.name,
        branch: user.branch
      });
      data.student_profiles.push({
        roll: user.username,
        email: profile.email,
        batch_year: profile.batch_year || 2026,
        leetcode_url: profile.leetcode_url || '',
        hackerrank_url: profile.hackerrank_url || '',
        codeforces_url: profile.codeforces_url || '',
        gfg_url: profile.gfg_url || '',
        codechef_url: profile.codechef_url || '',
        github_url: profile.github_url || '',
        leetcode_solved: profile.leetcode_solved || 0,
        leetcode_rank: profile.leetcode_rank || 'N/A',
        hackerrank_score: profile.hackerrank_score || 0,
        hackerrank_rank: profile.hackerrank_rank || 'N/A',
        codeforces_rating: profile.codeforces_rating || 0,
        codeforces_rank: profile.codeforces_rank || 'N/A',
        gfg_solved: profile.gfg_solved || 0,
        gfg_rank: profile.gfg_rank || 'N/A',
        codechef_solved: profile.codechef_solved || 0,
        codechef_rank: profile.codechef_rank || 'N/A',
        github_repos: profile.github_repos || 0,
        github_rank: profile.github_rank || 'N/A',
        total_score: profile.total_score || 0
      });
      writeFallbackData(data);
      return true;
    } else {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        
        const [existing] = await connection.query('SELECT username FROM users WHERE username = ?', [user.username]);
        if (existing.length > 0) {
          throw new Error('Roll Number already registered.');
        }

        await connection.query(
          'INSERT INTO users (username, password, role, name, branch) VALUES (?, ?, "student", ?, ?)',
          [user.username, user.password, user.name, user.branch]
        );
        await connection.query(
          `INSERT INTO student_profiles 
           (roll, email, batch_year, leetcode_url, hackerrank_url, codeforces_url, gfg_url, codechef_url, github_url, 
            leetcode_solved, leetcode_rank, hackerrank_score, hackerrank_rank, codeforces_rating, codeforces_rank, 
            gfg_solved, gfg_rank, codechef_solved, codechef_rank, github_repos, github_rank, total_score) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            user.username, profile.email, profile.batch_year || 2026,
            profile.leetcode_url || null, profile.hackerrank_url || null, profile.codeforces_url || null, profile.gfg_url || null, profile.codechef_url || null, profile.github_url || null,
            profile.leetcode_solved || 0, profile.leetcode_rank || 'N/A',
            profile.hackerrank_score || 0, profile.hackerrank_rank || 'N/A',
            profile.codeforces_rating || 0, profile.codeforces_rank || 'N/A',
            profile.gfg_solved || 0, profile.gfg_rank || 'N/A',
            profile.codechef_solved || 0, profile.codechef_rank || 'N/A',
            profile.github_repos || 0, profile.github_rank || 'N/A',
            profile.total_score || 0
          ]
        );
        await connection.commit();
        return true;
      } catch (err) {
        await connection.rollback();
        throw err;
      } finally {
        connection.release();
      }
    }
  },

  updateStudentProfile: async (roll, profile) => {
    if (isFallbackMode) {
      const data = readFallbackData();
      const profIdx = data.student_profiles.findIndex(p => p.roll === roll);
      if (profIdx !== -1) {
        data.student_profiles[profIdx] = {
          ...data.student_profiles[profIdx],
          leetcode_url: profile.leetcode_url || '',
          hackerrank_url: profile.hackerrank_url || '',
          codeforces_url: profile.codeforces_url || '',
          gfg_url: profile.gfg_url || '',
          codechef_url: profile.codechef_url || '',
          github_url: profile.github_url || '',
          batch_year: profile.batch_year !== undefined ? profile.batch_year : data.student_profiles[profIdx].batch_year,
          leetcode_solved: profile.leetcode_solved,
          leetcode_rank: profile.leetcode_rank || 'N/A',
          hackerrank_score: profile.hackerrank_score,
          hackerrank_rank: profile.hackerrank_rank || 'N/A',
          codeforces_rating: profile.codeforces_rating,
          codeforces_rank: profile.codeforces_rank || 'N/A',
          gfg_solved: profile.gfg_solved,
          gfg_rank: profile.gfg_rank || 'N/A',
          codechef_solved: profile.codechef_solved,
          codechef_rank: profile.codechef_rank || 'N/A',
          github_repos: profile.github_repos,
          github_rank: profile.github_rank || 'N/A',
          total_score: profile.total_score
        };
        writeFallbackData(data);
        return true;
      }
      throw new Error('Student profile not found.');
    } else {
      await pool.query(
        `UPDATE student_profiles SET 
           leetcode_url = ?, hackerrank_url = ?, codeforces_url = ?, gfg_url = ?, codechef_url = ?, github_url = ?,
           leetcode_solved = ?, leetcode_rank = ?, hackerrank_score = ?, hackerrank_rank = ?, codeforces_rating = ?, codeforces_rank = ?,
           gfg_solved = ?, gfg_rank = ?, codechef_solved = ?, codechef_rank = ?, github_repos = ?, github_rank = ?, total_score = ?, batch_year = ?
         WHERE roll = ?`,
        [
          profile.leetcode_url || null, profile.hackerrank_url || null, profile.codeforces_url || null, profile.gfg_url || null, profile.codechef_url || null, profile.github_url || null,
          profile.leetcode_solved, profile.leetcode_rank || 'N/A',
          profile.hackerrank_score, profile.hackerrank_rank || 'N/A',
          profile.codeforces_rating, profile.codeforces_rank || 'N/A',
          profile.gfg_solved, profile.gfg_rank || 'N/A',
          profile.codechef_solved, profile.codechef_rank || 'N/A',
          profile.github_repos, profile.github_rank || 'N/A',
          profile.total_score,
          profile.batch_year || 2026,
          roll
        ]
      );
      return true;
    }
  },

  deleteStudent: async (roll) => {
    if (isFallbackMode) {
      const data = readFallbackData();
      const userIndex = data.users.findIndex(u => u.username.toLowerCase() === roll.toLowerCase() && u.role === 'student');
      if (userIndex !== -1) {
        data.users.splice(userIndex, 1);
        const profileIndex = data.student_profiles.findIndex(p => p.roll.toLowerCase() === roll.toLowerCase());
        if (profileIndex !== -1) {
          data.student_profiles.splice(profileIndex, 1);
        }
        writeFallbackData(data);
        return true;
      }
      throw new Error('Student account not found.');
    } else {
      const [result] = await pool.query('DELETE FROM users WHERE username = ? AND role = "student"', [roll]);
      if (result.affectedRows === 0) {
        throw new Error('Student account not found.');
      }
      return true;
    }
  },

  addAuditLog: async (username, action) => {
    if (isFallbackMode) {
      const data = readFallbackData();
      data.audit_logs.push({
        id: data.audit_logs.length + 1,
        username,
        action,
        timestamp: new Date().toISOString()
      });
      writeFallbackData(data);
      return true;
    } else {
      await pool.query('INSERT INTO audit_logs (username, action) VALUES (?, ?)', [username, action]);
      return true;
    }
  },

  getAuditLogs: async () => {
    if (isFallbackMode) {
      const data = readFallbackData();
      return data.audit_logs;
    } else {
      const [rows] = await pool.query('SELECT * FROM audit_logs ORDER BY timestamp DESC');
      return rows;
    }
  },

  addNotice: async (title, message, priority) => {
    if (isFallbackMode) {
      const data = readFallbackData();
      data.notices.push({
        id: data.notices.length + 1,
        title,
        message,
        priority,
        created_at: new Date().toISOString()
      });
      writeFallbackData(data);
      return true;
    } else {
      await pool.query('INSERT INTO notices (title, message, priority) VALUES (?, ?, ?)', [title, message, priority]);
      return true;
    }
  },

  getNotices: async () => {
    if (isFallbackMode) {
      const data = readFallbackData();
      return data.notices;
    } else {
      const [rows] = await pool.query('SELECT * FROM notices ORDER BY created_at DESC');
      return rows;
    }
  },

  deleteNotice: async (id) => {
    if (isFallbackMode) {
      const data = readFallbackData();
      data.notices = data.notices.filter(n => n.id != id);
      writeFallbackData(data);
      return true;
    } else {
      await pool.query('DELETE FROM notices WHERE id = ?', [id]);
      return true;
    }
  },

  addAssignment: async (title, description, deadline, target_batches, target_branches) => {
    if (isFallbackMode) {
      const data = readFallbackData();
      data.assignments.push({
        id: data.assignments.length + 1,
        title,
        description,
        deadline,
        target_batches,
        target_branches,
        created_at: new Date().toISOString()
      });
      writeFallbackData(data);
      return true;
    } else {
      await pool.query(
        'INSERT INTO assignments (title, description, deadline, target_batches, target_branches) VALUES (?, ?, ?, ?, ?)',
        [title, description, deadline, target_batches, target_branches]
      );
      return true;
    }
  },

  getAssignments: async () => {
    if (isFallbackMode) {
      const data = readFallbackData();
      return data.assignments;
    } else {
      const [rows] = await pool.query('SELECT * FROM assignments ORDER BY created_at DESC');
      return rows;
    }
  },

  addActivityLog: async (username, action) => {
    if (isFallbackMode) {
      const data = readFallbackData();
      data.activity_logs.push({
        id: data.activity_logs.length + 1,
        username,
        action,
        timestamp: new Date().toISOString()
      });
      writeFallbackData(data);
      return true;
    } else {
      await pool.query('INSERT INTO activity_logs (username, action) VALUES (?, ?)', [username, action]);
      return true;
    }
  },

  getActivityLogs: async () => {
    if (isFallbackMode) {
      const data = readFallbackData();
      return data.activity_logs;
    } else {
      const [rows] = await pool.query('SELECT * FROM activity_logs ORDER BY timestamp DESC');
      return rows;
    }
  },

  createUser: async (username, password, name, role, branch, email = null) => {
    if (isFallbackMode) {
      const data = readFallbackData();
      if (data.users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
        throw new Error('User account already exists.');
      }
      data.users.push({ username, password, name, role, branch, email });
      writeFallbackData(data);
      return true;
    } else {
      const [existing] = await pool.query('SELECT username FROM users WHERE username = ?', [username]);
      if (existing.length > 0) {
        throw new Error('User account already exists.');
      }
      await pool.query(
        'INSERT INTO users (username, password, role, name, branch, email) VALUES (?, ?, ?, ?, ?, ?)',
        [username, password, role, name, branch, email]
      );
      return true;
    }
  },

  getUsers: async () => {
    if (isFallbackMode) {
      const data = readFallbackData();
      return data.users;
    } else {
      const [rows] = await pool.query('SELECT username, password, name, role, branch, email FROM users');
      return rows;
    }
  },

  updateUserPassword: async (username, password) => {
    if (isFallbackMode) {
      const data = readFallbackData();
      const user = data.users.find(u => u.username.toLowerCase() === username.toLowerCase());
      if (user) {
        user.password = password;
        writeFallbackData(data);
        return true;
      }
      throw new Error('User not found.');
    } else {
      const [result] = await pool.query('UPDATE users SET password = ? WHERE username = ?', [password, username]);
      if (result.affectedRows === 0) {
        throw new Error('User not found.');
      }
      return true;
    }
  },

  updateUserEmail: async (username, email) => {
    if (isFallbackMode) {
      const data = readFallbackData();
      const user = data.users.find(u => u.username.toLowerCase() === username.toLowerCase());
      if (user) {
        user.email = email;
        writeFallbackData(data);
        return true;
      }
      throw new Error('User not found.');
    } else {
      const [result] = await pool.query('UPDATE users SET email = ? WHERE username = ?', [email, username]);
      if (result.affectedRows === 0) {
        throw new Error('User not found.');
      }
      return true;
    }
  },

  deleteUser: async (username) => {
    if (isFallbackMode) {
      const data = readFallbackData();
      const idx = data.users.findIndex(u => u.username.toLowerCase() === username.toLowerCase());
      if (idx !== -1) {
        data.users.splice(idx, 1);
        writeFallbackData(data);
        return true;
      }
      throw new Error('User not found.');
    } else {
      const [result] = await pool.query('DELETE FROM users WHERE username = ?', [username]);
      if (result.affectedRows === 0) {
        throw new Error('User not found.');
      }
      return true;
    }
  },

  adminUpdateStudent: async (roll, name, email, branch, batchYear) => {
    if (isFallbackMode) {
      const data = readFallbackData();
      const uIdx = data.users.findIndex(u => u.username.toLowerCase() === roll.toLowerCase());
      if (uIdx !== -1) {
        data.users[uIdx].name = name;
        data.users[uIdx].branch = branch;
      }
      const pIdx = data.student_profiles.findIndex(p => p.roll.toLowerCase() === roll.toLowerCase());
      if (pIdx !== -1) {
        data.student_profiles[pIdx].email = email;
        data.student_profiles[pIdx].batch_year = parseInt(batchYear);
      }
      writeFallbackData(data);
      return true;
    } else {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        await connection.query('UPDATE users SET name = ?, branch = ? WHERE username = ?', [name, branch, roll]);
        await connection.query('UPDATE student_profiles SET email = ?, batch_year = ? WHERE roll = ?', [email, batchYear, roll]);
        await connection.commit();
        return true;
      } catch (err) {
        await connection.rollback();
        throw err;
      } finally {
        connection.release();
      }
    }
  },

  updateUserPassword: async (username, newPassword) => {
    if (isFallbackMode) {
      const data = readFallbackData();
      const user = data.users.find(u => u.username.toLowerCase() === username.toLowerCase());
      if (user) {
        user.password = newPassword;
        writeFallbackData(data);
        return true;
      }
      return false;
    } else {
      const [res] = await pool.query('UPDATE users SET password = ? WHERE username = ?', [newPassword, username]);
      return res.affectedRows > 0;
    }
  }
};

module.exports = {
  initDb,
  db
};
