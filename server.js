const path = require('path');
const express = require('express');
const cors = require('cors');
const dns = require('dns');
const { initDb, db } = require('./db');
const nodemailer = require('nodemailer');

// Setup SMTP Transporter for real email delivery
const smtpTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  }
});

// Force IPv4 DNS resolution first to avoid macOS/localhost loopback/IPv6 timeout hangs
dns.setDefaultResultOrder('ipv4first');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve Static Frontend files
app.use(express.static(path.join(__dirname)));

// Helper: Timeout-based fetch
const fetchWithTimeout = (url, options = {}, timeout = 3000) => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Request timed out'));
    }, timeout);

    fetch(url, options)
      .then(
        (response) => {
          clearTimeout(timer);
          resolve(response);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        }
      );
  });
};

// Helper: Extract username from profile URL
function extractUsername(url, platform) {
  if (!url) return null;
  try {
    const cleanUrl = url.trim().replace(/\/$/, ""); // remove trailing slash
    const parts = cleanUrl.split('/');
    
    if (platform === 'leetcode') {
      if (cleanUrl.includes('/u/')) {
        return parts[parts.indexOf('u') + 1];
      }
      return parts[parts.length - 1];
    }
    
    return parts[parts.length - 1];
  } catch (e) {
    return null;
  }
}

// Platform Fetchers returning { solved/rating/score/repos, rank }
async function getLeetCodeStats(username) {
  const query = {
    query: `query getUserProfile($username: String!) {
      matchedUser(username: $username) {
        submitStats {
          acSubmissionNum {
            difficulty
            count
          }
        }
        profile {
          ranking
        }
      }
    }`,
    variables: { username }
  };
  
  const res = await fetchWithTimeout('https://leetcode.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://leetcode.com/'
    },
    body: JSON.stringify(query)
  });
  
  if (!res.ok) throw new Error('LeetCode unavailable');
  const data = await res.json();
  if (data.data && data.data.matchedUser) {
    const user = data.data.matchedUser;
    const allStats = user.submitStats.acSubmissionNum.find(s => s.difficulty === 'All');
    const solved = allStats ? allStats.count : 0;
    const rank = user.profile ? user.profile.ranking : 'N/A';
    return { solved, rank: rank ? rank.toString() : 'N/A' };
  }
  throw new Error('LeetCode user not found');
}

async function getHackerRankStats(username) {
  const res = await fetchWithTimeout(`https://www.hackerrank.com/rest/contests/master/hackers/${username}/profile`, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  if (!res.ok) throw new Error('HackerRank unavailable');
  const data = await res.json();
  
  const level = (data.model && data.model.level) || data.level || 1;
  const rankStr = `Level ${level}`;
  
  let score = level * 50;
  try {
    const badgeRes = await fetchWithTimeout(`https://www.hackerrank.com/rest/hackers/${username}/badges`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (badgeRes.ok) {
      const badgeData = await badgeRes.json();
      if (badgeData && Array.isArray(badgeData.models)) {
        const sumPoints = badgeData.models.reduce((sum, b) => sum + (b.current_points || 0), 0);
        if (sumPoints > 0) {
          score = sumPoints;
        } else {
          score += badgeData.models.reduce((sum, b) => sum + (b.stars || 0) * 10, 0);
        }
      }
    }
  } catch (e) {
    console.warn(`[HackerRank Scraper] Could not fetch badges for ${username}:`, e.message);
  }

  return {
    score: Math.round(score),
    rank: rankStr
  };
}

async function getCodeforcesStats(username) {
  const res = await fetchWithTimeout(`https://codeforces.com/api/user.info?handles=${username}`);
  if (!res.ok) throw new Error('Codeforces unavailable');
  const data = await res.json();
  if (data.status === 'OK' && data.result && data.result[0]) {
    const user = data.result[0];
    return {
      rating: user.rating || 0,
      rank: user.rank || 'Unrated'
    };
  }
  throw new Error('Codeforces parse error');
}

async function getGeeksforGeeksStats(username) {
  const res = await fetchWithTimeout(`https://www.geeksforgeeks.org/user/${username}/`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });
  if (!res.ok) throw new Error('GFG unavailable');
  const html = await res.text();
  
  const solvedMatch = html.match(/total_problems_solved\\?"?\s*:\s*(\d+)/i);
  const scoreMatch = html.match(/score\\?"?\s*:\s*(\d+)/i);
  const rankMatch = html.match(/institute_rank\\?"?\s*:\s*\\?"?([^\\",}]*)\\?"?/i);
  
  if (solvedMatch || scoreMatch) {
    const solved = solvedMatch ? parseInt(solvedMatch[1]) : 0;
    const rank = rankMatch && rankMatch[1] ? rankMatch[1].trim() : 'N/A';
    return { solved, rank: rank || 'N/A' };
  }
  throw new Error('GFG parse error');
}

async function getCodeChefStats(username) {
  const res = await fetchWithTimeout(`https://www.codechef.com/users/${username}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });
  if (!res.ok) throw new Error('CodeChef unavailable');
  const html = await res.text();
  
  const solvedMatch = html.match(/Fully Solved\s*\((\d+)\)/i) || html.match(/Problems Solved[^0-9]*(\d+)/i) || html.match(/Solved Problems[^0-9]*(\d+)/i);
  const globalRankMatch = html.match(/<strong>\s*([0-9a-zA-Z]+)\s*<\/strong>[\s\S]*?Global Rank/i) || html.match(/Global Rank[\s\S]*?<strong>\s*([0-9a-zA-Z]+)\s*<\/strong>/i);
  
  if (solvedMatch) {
    const solved = parseInt(solvedMatch[1]);
    const rank = globalRankMatch && globalRankMatch[1] ? globalRankMatch[1] : 'N/A';
    return { solved, rank };
  }
  throw new Error('CodeChef parse error');
}

async function getGithubStats(username) {
  const res = await fetchWithTimeout(`https://api.github.com/users/${username}`, {
    headers: { 'User-Agent': 'ideal-code-tracker' }
  });
  if (!res.ok) throw new Error('GitHub unavailable');
  const data = await res.json();
  const repos = data.public_repos || 0;
  const followers = data.followers || 0;
  return {
    repos,
    rank: `Followers: ${followers}`
  };
}

// Controller: Fetch live coding statistics
async function fetchPlatformStats(roll, name, urls) {
  const { leetcode, hackerrank, codeforces, gfg, codechef, github } = urls;
  
  const stats = {
    leetcode_solved: 0,
    leetcode_rank: 'N/A',
    hackerrank_score: 0,
    hackerrank_rank: 'N/A',
    codeforces_rating: 0,
    codeforces_rank: 'N/A',
    gfg_solved: 0,
    gfg_rank: 'N/A',
    codechef_solved: 0,
    codechef_rank: 'N/A',
    github_repos: 0,
    github_rank: 'N/A'
  };

  const tryFetch = async (platform, url, fetchFn) => {
    if (!url) return { solved: 0, rating: 0, score: 0, repos: 0, rank: 'N/A' };
    const username = extractUsername(url, platform);
    if (!username) return { solved: 0, rating: 0, score: 0, repos: 0, rank: 'N/A' };
    try {
      return await fetchFn(username);
    } catch (e) {
      console.warn(`[Live Crawler] Failed to fetch for ${platform} (${username}):`, e.message, `- defaulting to 0/N/A`);
      return { solved: 0, rating: 0, score: 0, repos: 0, rank: 'N/A' };
    }
  };

  const lcRes = await tryFetch('leetcode', leetcode, getLeetCodeStats);
  stats.leetcode_solved = lcRes.solved;
  stats.leetcode_rank = lcRes.rank;

  const hrRes = await tryFetch('hackerrank', hackerrank, getHackerRankStats);
  stats.hackerrank_score = hrRes.score;
  stats.hackerrank_rank = hrRes.rank;

  const cfRes = await tryFetch('codeforces', codeforces, getCodeforcesStats);
  stats.codeforces_rating = cfRes.rating;
  stats.codeforces_rank = cfRes.rank;

  const gfgRes = await tryFetch('gfg', gfg, getGeeksforGeeksStats);
  stats.gfg_solved = gfgRes.solved;
  stats.gfg_rank = gfgRes.rank;

  const ccRes = await tryFetch('codechef', codechef, getCodeChefStats);
  stats.codechef_solved = ccRes.solved;
  stats.codechef_rank = ccRes.rank;

  const ghRes = await tryFetch('github', github, getGithubStats);
  stats.github_repos = ghRes.repos;
  stats.github_rank = ghRes.rank;

  stats.total_score = Math.round(
    stats.leetcode_solved * 5 +
    stats.hackerrank_score * 1.5 +
    stats.codeforces_rating * 1.0 +
    stats.gfg_solved * 4 +
    stats.codechef_solved * 3 +
    stats.github_repos * 10
  );

  return stats;
}

// API: User Authentication (Login)
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username/Roll and password are required.' });
  }

  try {
    const user = await db.getUser(username);
    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    res.json({
      message: 'Login successful',
      user: {
        username: user.username,
        name: user.name,
        role: user.role,
        branch: user.branch,
        email: user.email
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// API: User Forgot Password Recovery
app.post('/api/auth/forgot-password', async (req, res) => {
  const { username } = req.body;
  if (!username) {
    return res.status(400).json({ error: 'Username is required.' });
  }

  try {
    const user = await db.getUser(username);
    if (!user) {
      // Return generic message for security (don't disclose username existence)
      return res.json({ message: 'If the account exists, a password recovery email has been sent.' });
    }

    let email = null;
    if (user.role === 'student') {
      const students = await db.getAllStudents();
      const student = students.find(s => s.roll.toUpperCase() === username.toUpperCase());
      if (student) {
        email = student.email;
      }
    } else {
      // Route recovery email to registered work/recovery Gmail, fallback to username
      email = user.email || user.username;
    }

    if (email) {
      const hasSmtpConfig = process.env.SMTP_USER && process.env.SMTP_PASS;
      if (hasSmtpConfig) {
        await smtpTransporter.sendMail({
          from: `"Ideal Code Tracker" <${process.env.SMTP_USER}>`,
          to: email,
          subject: 'Code Tracker Password Recovery',
          text: `Hello ${user.name},\n\nYour account password is: ${user.password}\n\nRegards,\nCollege Code Tracker Team`,
          html: `<div style="font-family: Arial, sans-serif; line-height: 1.5; color: #333;">
                   <h2>Password Recovery</h2>
                   <p>Hello <strong>${user.name}</strong>,</p>
                   <p>You requested password recovery for your college Code Tracker account.</p>
                   <div style="background: #f9fafb; border: 1px solid #e5e7eb; padding: 15px; border-left: 4px solid #10b981; border-radius: 6px; margin: 15px 0; font-size: 1.1em;">
                     Your account password is: <strong style="color: #4f46e5;">${user.password}</strong>
                   </div>
                   <p style="font-size: 0.85em; color: #6b7280; margin-top: 20px;">
                     This is an automated notification. Please change your password if you suspect unauthorized access.
                   </p>
                 </div>`
        });
        console.log(`[Password Recovery] Sent email to ${email} for user ${username}`);
      } else {
        console.log(`[Password Recovery Sim] Sent email to ${email} for user ${username}. Password is: ${user.password}`);
      }
    }

    res.json({ message: 'If the account exists, a password recovery email has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// API: User Change Password
app.post('/api/auth/change-password', async (req, res) => {
  const { username, currentPassword, newPassword } = req.body;
  if (!username || !currentPassword || !newPassword) {
    return res.status(400).json({ error: 'All fields (username, currentPassword, newPassword) are required.' });
  }

  try {
    const user = await db.getUser(username);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (user.password !== currentPassword) {
      return res.status(401).json({ error: 'Incorrect current password.' });
    }

    const success = await db.updateUserPassword(username, newPassword);
    if (success) {
      return res.json({ message: 'Password updated successfully.' });
    } else {
      return res.status(500).json({ error: 'Failed to update password.' });
    }
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// API: Student Registration (Signup)
app.post('/api/auth/register', async (req, res) => {
  const { roll, name, email, branch, password, leetcode, hackerrank, codeforces, gfg, codechef, github, batchYear } = req.body;

  if (!roll || !name || !email || !branch || !password) {
    return res.status(400).json({ error: 'Identity details and password are required.' });
  }

  try {
    // Fetch live statistics
    const stats = await fetchPlatformStats(roll, name, {
      leetcode, hackerrank, codeforces, gfg, codechef, github
    });

    const userObj = {
      username: roll.toUpperCase(),
      password,
      name,
      branch
    };

    const profileObj = {
      email,
      batch_year: parseInt(batchYear || 2026),
      leetcode_url: leetcode || null,
      hackerrank_url: hackerrank || null,
      codeforces_url: codeforces || null,
      gfg_url: gfg || null,
      codechef_url: codechef || null,
      github_url: github || null,
      ...stats
    };

    await db.registerStudent(userObj, profileObj);

    res.status(201).json({
      message: 'Registration successful',
      user: {
        username: userObj.username,
        name: userObj.name,
        role: 'student',
        branch: userObj.branch
      }
    });
  } catch (err) {
    console.error('Registration error:', err);
    if (err.message.includes('registered')) {
      return res.status(409).json({ error: err.message });
    }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// API: Retrieve All Students (and rankings)
app.get('/api/students', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const students = await db.getAllStudents();
    res.json({ students });
  } catch (err) {
    console.error('Get students error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// API: Update Student Profile Links
app.put('/api/students/:roll', async (req, res) => {
  const { roll } = req.params;
  const { leetcode, hackerrank, codeforces, gfg, codechef, github, name, batchYear } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Student name is required.' });
  }

  try {
    // Fetch live statistics
    const stats = await fetchPlatformStats(roll, name, {
      leetcode, hackerrank, codeforces, gfg, codechef, github
    });

    const profileObj = {
      leetcode_url: leetcode || null,
      hackerrank_url: hackerrank || null,
      codeforces_url: codeforces || null,
      gfg_url: gfg || null,
      codechef_url: codechef || null,
      github_url: github || null,
      batch_year: batchYear ? parseInt(batchYear) : undefined,
      ...stats
    };

    await db.updateStudentProfile(roll.toUpperCase(), profileObj);

    res.json({
      message: 'Profile updated successfully',
      stats
    });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// API: Delete Student Account
app.delete('/api/students/:roll', async (req, res) => {
  const { roll } = req.params;
  try {
    await db.deleteStudent(roll.toUpperCase());
    res.json({ message: 'Student account deleted successfully' });
  } catch (err) {
    console.error('Delete student error:', err);
    if (err.message.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ================= Admin Portal APIs =================

// Helper to log administrative operations
async function logAdminAction(adminUser, action) {
  try {
    await db.addAuditLog(adminUser || 'Admin', action);
  } catch (err) {
    console.error('Failed to log admin action:', err);
  }
}

// 1. Get Audit Logs
app.get('/api/admin/audit-logs', async (req, res) => {
  try {
    const logs = await db.getAuditLogs();
    res.json({ logs });
  } catch (err) {
    console.error('Get audit logs error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// 2. Get Activity Logs
app.get('/api/admin/activity-logs', async (req, res) => {
  try {
    const logs = await db.getActivityLogs();
    res.json({ logs });
  } catch (err) {
    console.error('Get activity logs error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// 3. Notices/Announcements
app.get('/api/admin/notices', async (req, res) => {
  try {
    const notices = await db.getNotices();
    res.json({ notices });
  } catch (err) {
    console.error('Get notices error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

app.post('/api/admin/notices', async (req, res) => {
  const { title, message, priority, adminUser } = req.body;
  if (!title || !message) {
    return res.status(400).json({ error: 'Title and message are required.' });
  }
  try {
    await db.addNotice(title, message, priority || 'normal');
    await logAdminAction(adminUser, `Published notice: "${title}" (Priority: ${priority || 'normal'})`);
    res.status(201).json({ message: 'Announcement published successfully' });
  } catch (err) {
    console.error('Create notice error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

app.delete('/api/admin/notices/:id', async (req, res) => {
  const { id } = req.params;
  const { adminUser } = req.query;
  try {
    await db.deleteNotice(id);
    await logAdminAction(adminUser || 'admin', `Deleted notice ID: ${id}`);
    res.json({ message: 'Announcement deleted successfully' });
  } catch (err) {
    console.error('Delete notice error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// 4. Assignments
app.get('/api/admin/assignments', async (req, res) => {
  try {
    const assignments = await db.getAssignments();
    res.json({ assignments });
  } catch (err) {
    console.error('Get assignments error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

app.post('/api/admin/assignments', async (req, res) => {
  const { title, description, deadline, targetBatches, targetBranches, adminUser } = req.body;
  if (!title || !description || !deadline) {
    return res.status(400).json({ error: 'Title, description and deadline are required.' });
  }
  try {
    await db.addAssignment(title, description, deadline, targetBatches || 'ALL', targetBranches || 'ALL');
    await logAdminAction(adminUser, `Created assignment: "${title}" for batches: ${targetBatches || 'ALL'}`);
    res.status(201).json({ message: 'Assignment created successfully' });
  } catch (err) {
    console.error('Create assignment error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// 5. Access Management
app.get('/api/admin/accounts', async (req, res) => {
  try {
    const users = await db.getUsers();
    res.json({ users });
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

app.post('/api/admin/accounts', async (req, res) => {
  const { username, password, name, role, branch, email, adminUser } = req.body;
  if (!username || !password || !name || !role) {
    return res.status(400).json({ error: 'Username, password, name, and role are required.' });
  }
  try {
    await db.createUser(username, password, name, role, branch || null, email || null);
    await logAdminAction(adminUser, `Created user account: "${username}" with role: ${role}`);
    res.status(201).json({ message: 'Account created successfully' });
  } catch (err) {
    console.error('Create account error:', err);
    res.status(409).json({ error: err.message });
  }
});

app.delete('/api/admin/accounts/:username', async (req, res) => {
  const { username } = req.params;
  const { adminUser } = req.query;
  try {
    await db.deleteUser(username);
    await logAdminAction(adminUser, `Deleted user account: "${username}"`);
    res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(404).json({ error: err.message });
  }
});

app.post('/api/auth/update-email', async (req, res) => {
  const { username, email } = req.body;
  if (!username || !email) {
    return res.status(400).json({ error: 'Username and recovery email are required.' });
  }
  try {
    await db.updateUserEmail(username, email);
    res.json({ message: 'Recovery email updated successfully.' });
  } catch (err) {
    console.error('Update email error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

app.put('/api/admin/accounts/:username/password', async (req, res) => {
  const { username } = req.params;
  const { password, adminUser } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Password is required.' });
  }
  try {
    await db.updateUserPassword(username, password);
    await logAdminAction(adminUser || 'admin', `Updated password for user account: "${username}"`);
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Admin update user password error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// 6. Admin Update Student Details
app.put('/api/admin/students/:roll', async (req, res) => {
  const { roll } = req.params;
  const { name, email, branch, batchYear, adminUser } = req.body;
  if (!name || !email || !branch || !batchYear) {
    return res.status(400).json({ error: 'Name, email, branch, and batchYear are required.' });
  }
  try {
    await db.adminUpdateStudent(roll, name, email, branch, batchYear);
    await logAdminAction(adminUser, `Updated student credentials/profile for roll: ${roll}`);
    res.json({ message: 'Student details updated successfully' });
  } catch (err) {
    console.error('Admin student update error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// 7. Send Notifications (Gmail Broadcast Sim & Real SMTP)
app.post('/api/admin/notify', async (req, res) => {
  const { sendVia, recipientsType, batchFilter, yearFilter, platformFilter, subject, body, adminUser } = req.body;
  if (!subject || !body) {
    return res.status(400).json({ error: 'Subject and body are required.' });
  }
  try {
    // Get all students
    const students = await db.getAllStudents();
    
    // Apply filters
    const targetStudents = students.filter(student => {
      if (recipientsType === 'all') return true;
      // Filter by batch year (e.g. 2027)
      if (batchFilter && batchFilter !== 'ALL' && student.batchYear != batchFilter) return false;
      // Filter by academic branch
      if (yearFilter && yearFilter !== 'ALL' && student.branch !== yearFilter) return false;
      
      // Filter by platform existence
      if (platformFilter && platformFilter !== 'ALL') {
        const hasPlatform = student[platformFilter] && student[platformFilter].trim() !== '';
        if (!hasPlatform) return false;
      }
      return true;
    });

    const hasSmtpConfig = process.env.SMTP_USER && process.env.SMTP_PASS;

    if (hasSmtpConfig) {
      console.log(`[Email Notification] sending "${subject}" to ${targetStudents.length} recipients...`);
      const emailPromises = targetStudents.map(student => {
        if (!student.email) return Promise.resolve();
        return smtpTransporter.sendMail({
          from: `"Ideal Code Tracker" <${process.env.SMTP_USER}>`,
          to: student.email,
          subject: subject,
          text: body,
          html: `<div style="font-family: Arial, sans-serif; line-height: 1.5; color: #333;">
                   <h2>Code Tracker Alert</h2>
                   <p>Hello <strong>${student.name}</strong>,</p>
                   <div style="background: #f9fafb; border: 1px solid #e5e7eb; padding: 15px; border-left: 4px solid #6366f1; border-radius: 6px; margin: 15px 0;">
                     ${body.replace(/\n/g, '<br>')}
                   </div>
                   <p style="font-size: 0.85em; color: #6b7280; margin-top: 20px;">
                     This is an automated notification from your college Code Tracker dashboard.
                   </p>
                 </div>`
        }).catch(err => {
          console.error(`Failed to send email to ${student.email}:`, err.message);
        });
      });

      await Promise.all(emailPromises);
      await logAdminAction(adminUser, `Dispatched broadcast email: "${subject}" to ${targetStudents.length} recipients.`);
      res.json({ message: `Broadcast successfully sent to ${targetStudents.length} students via SMTP.` });
    } else {
      console.log(`[Email Notification Sim] sending "${subject}" to ${targetStudents.length} recipients (SMTP not configured)...`);
      targetStudents.forEach(student => {
        if (student.email) {
          console.log(`- Simulated email to ${student.name} <${student.email}>`);
        }
      });
      await logAdminAction(adminUser, `Dispatched simulated email notification: "${subject}" to ${targetStudents.length} target users.`);
      res.json({ message: `Broadcast successfully simulated for ${targetStudents.length} students. (Configure SMTP settings in .env to send real emails)` });
    }
  } catch (err) {
    console.error('Broadcast notify error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// 8. Refresh Sync Operations
app.post('/api/admin/refresh', async (req, res) => {
  const { type, adminUser } = req.body; // 'pending' | 'all' | 'async'
  try {
    const students = await db.getAllStudents();
    
    // Filtering targets
    let targets = [];
    if (type === 'pending') {
      // Find students with pending ratings (e.g. at least one platform rating is N/A or rating/solved is 0)
      targets = students.filter(s => {
        const hasPending = !s.leetcode || !s.hackerrank || !s.codeforces || !s.gfg || !s.codechef || !s.github;
        return hasPending;
      });
    } else {
      targets = students;
    }

    if (type === 'async') {
      // Background execution: trigger crawl but don't await response
      res.json({ message: `Background refresh queued for ${targets.length} students.`, status: 'queued' });
      
      // Run async job
      (async () => {
        console.log(`[Async Background Sync] Syncing metrics for ${targets.length} students...`);
        for (const student of targets) {
          try {
            const stats = await fetchPlatformStats(student.roll, student.name, {
              leetcode: student.leetcode,
              hackerrank: student.hackerrank,
              codeforces: student.codeforces,
              gfg: student.gfg,
              codechef: student.codechef,
              github: student.github
            });
            const profileObj = {
              leetcode_url: student.leetcode || null,
              hackerrank_url: student.hackerrank || null,
              codeforces_url: student.codeforces || null,
              gfg_url: student.gfg || null,
              codechef_url: student.codechef || null,
              github_url: student.github || null,
              ...stats
            };
            await db.updateStudentProfile(student.roll, profileObj);
          } catch (e) {
            console.error(`[Async Background Sync] failed for ${student.roll}:`, e.message);
          }
        }
        await logAdminAction('System Scheduler', `Completed background sync refresh for ${targets.length} students.`);
      })();
      return;
    }

    // Synchronous execution: await all
    console.log(`[Sync Metrics Service] Syncing metrics for ${targets.length} students...`);
    for (const student of targets) {
      try {
        const stats = await fetchPlatformStats(student.roll, student.name, {
          leetcode: student.leetcode,
          hackerrank: student.hackerrank,
          codeforces: student.codeforces,
          gfg: student.gfg,
          codechef: student.codechef,
          github: student.github
        });
        const profileObj = {
          leetcode_url: student.leetcode || null,
          hackerrank_url: student.hackerrank || null,
          codeforces_url: student.codeforces || null,
          gfg_url: student.gfg || null,
          codechef_url: student.codechef || null,
          github_url: student.github || null,
          ...stats
        };
        await db.updateStudentProfile(student.roll, profileObj);
      } catch (e) {
        console.error(`[Sync Metrics Service] failed for ${student.roll}:`, e.message);
      }
    }

    await logAdminAction(adminUser, `Completed manual metrics refresh (${type}) for ${targets.length} students.`);
    res.json({ message: `Successfully refreshed stats for ${targets.length} students.` });
  } catch (err) {
    console.error('Sync refresh error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// =================== OTP VERIFICATION ===================

// In-memory OTP store: email -> { otp, expiresAt }
const otpStore = new Map();

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// POST /api/auth/send-otp
app.post('/api/auth/send-otp', async (req, res) => {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }
  const otp = generateOTP();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
  console.log(`[OTP DevLog] Generated OTP for ${email}: ${otp}`);
  otpStore.set(email.toLowerCase(), { otp, expiresAt });
  const hasSmtpConfig = process.env.SMTP_USER && process.env.SMTP_PASS;
  if (hasSmtpConfig) {
    try {
      await smtpTransporter.sendMail({
        from: `"Ideal Code Tracker" <${process.env.SMTP_USER}>`,
        to: email,
        subject: 'Your OTP Verification Code — Ideal Code Tracker',
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#333;">
          <h2 style="color:#6366f1;">Email Verification</h2>
          <p>Your one-time password (OTP) for Ideal Code Tracker is:</p>
          <div style="background:#f3f4f6;border-left:4px solid #6366f1;padding:15px 20px;border-radius:6px;margin:15px 0;font-size:2rem;font-weight:700;letter-spacing:8px;color:#4f46e5;">${otp}</div>
          <p style="font-size:0.85em;color:#6b7280;">This OTP is valid for <strong>10 minutes</strong>. Do not share it with anyone.</p>
        </div>`
      });
      console.log(`[OTP] Sent OTP to ${email}`);
    } catch (err) {
      console.error('[OTP] Email send failed:', err.message);
      return res.status(500).json({ error: 'Failed to send OTP email. Please try again.' });
    }
  } else {
    console.log(`[OTP Sim] OTP for ${email}: ${otp}`);
  }
  res.json({ message: 'OTP sent successfully. Please check your email.' });
});

// POST /api/auth/verify-otp
app.post('/api/auth/verify-otp', (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP are required.' });
  }
  const record = otpStore.get(email.toLowerCase());
  if (!record) {
    return res.status(400).json({ error: 'No OTP found for this email. Please request a new one.' });
  }
  if (Date.now() > record.expiresAt) {
    otpStore.delete(email.toLowerCase());
    return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
  }
  if (record.otp !== otp.trim()) {
    return res.status(400).json({ error: 'Invalid OTP. Please try again.' });
  }
  otpStore.delete(email.toLowerCase());
  res.json({ message: 'Email verified successfully.' });
});

// =================== INTERNSHIP APIs ===================

// GET /api/internships/titles — get all published titles with items
app.get('/api/internships/titles', async (req, res) => {
  try {
    const titles = await db.getInternshipTitles();
    res.json({ titles });
  } catch (err) {
    console.error('Get internship titles error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/internships/titles — Coordinator/Admin publish a new title
app.post('/api/internships/titles', async (req, res) => {
  const { title, coordinator, filterBranch, filterBatch } = req.body;
  if (!title || !coordinator) {
    return res.status(400).json({ error: 'Title and coordinator are required.' });
  }
  try {
    const newId = await db.createInternshipTitle(title, coordinator, filterBranch || 'ALL', filterBatch || 'ALL');
    await db.addAuditLog(coordinator, `Published internship title: "${title}" (Branch: ${filterBranch || 'ALL'}, Batch: ${filterBatch || 'ALL'})`);
    res.status(201).json({ message: 'Title published successfully', id: newId });
  } catch (err) {
    console.error('Create internship title error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// PUT /api/internships/titles/:id — Update a title name
app.put('/api/internships/titles/:id', async (req, res) => {
  const { id } = req.params;
  const { title, coordinator } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'Title is required.' });
  }
  try {
    const success = await db.updateInternshipTitle(id, title);
    if (success) {
      await db.addAuditLog(coordinator || 'coordinator', `Updated internship title ID: ${id} to name: ${title}`);
      res.json({ message: 'Title updated successfully.' });
    } else {
      res.status(404).json({ error: 'Title not found.' });
    }
  } catch (err) {
    console.error('Update internship title error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// DELETE /api/internships/titles/:id — Delete a title (and all its items)
app.delete('/api/internships/titles/:id', async (req, res) => {
  const { id } = req.params;
  const { coordinator } = req.query;
  try {
    await db.deleteInternshipTitle(id);
    await db.addAuditLog(coordinator || 'coordinator', `Deleted internship title ID: ${id}`);
    res.json({ message: 'Title deleted successfully.' });
  } catch (err) {
    console.error('Delete internship title error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/internships/titles/:id/items — Add internship item to a title
app.post('/api/internships/titles/:id/items', async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Internship name is required.' });
  }
  try {
    const newItemId = await db.addInternshipItem(id, name);
    res.status(201).json({ message: 'Item added successfully', id: newItemId });
  } catch (err) {
    console.error('Add internship item error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// DELETE /api/internships/items/:id — Delete an internship item
app.delete('/api/internships/items/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await db.deleteInternshipItem(id);
    res.json({ message: 'Item deleted successfully.' });
  } catch (err) {
    console.error('Delete internship item error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/internships/student/:roll — Get student's submissions
app.get('/api/internships/student/:roll', async (req, res) => {
  const { roll } = req.params;
  try {
    const submissions = await db.getStudentSubmissions(roll.toUpperCase());
    res.json({ submissions });
  } catch (err) {
    console.error('Get student submissions error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/internships/submit — Student submits tick-marked internships
app.post('/api/internships/submit', async (req, res) => {
  const { studentRoll, titleId, itemIds } = req.body;
  if (!studentRoll || !titleId) {
    return res.status(400).json({ error: 'studentRoll and titleId are required.' });
  }
  try {
    await db.submitStudentInternships(studentRoll.toUpperCase(), titleId, itemIds || []);
    await db.addAuditLog(studentRoll.toUpperCase(), `Submitted internship form for title ID: ${titleId}`);
    res.json({ message: 'Internship submitted successfully.' });
  } catch (err) {
    console.error('Student internship submit error:', err);
    if (err.message.includes('Already submitted')) {
      return res.status(409).json({ error: err.message });
    }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/internships/overview — Coordinator/Admin: all student submissions
app.get('/api/internships/overview', async (req, res) => {
  try {
    const [submissions, titles, students] = await Promise.all([
      db.getAllInternshipSubmissions(),
      db.getInternshipTitles(),
      db.getAllStudents()
    ]);
    res.json({ submissions, titles, students });
  } catch (err) {
    console.error('Internship overview error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// PUT /api/internships/admin/submission — Admin override a student's submission
app.put('/api/internships/admin/submission', async (req, res) => {
  const { studentRoll, titleId, itemIds, adminUser } = req.body;
  if (!studentRoll || !titleId) {
    return res.status(400).json({ error: 'studentRoll and titleId are required.' });
  }
  try {
    await db.adminUpdateStudentSubmission(studentRoll.toUpperCase(), titleId, itemIds || []);
    await logAdminAction(adminUser || 'admin', `Admin override submission for ${studentRoll} on title ID: ${titleId}`);
    res.json({ message: 'Submission updated by admin.' });
  } catch (err) {
    console.error('Admin submission override error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Serve frontend for any other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});


// Automated daily scraping at 9:00 PM IST (15:30 UTC)
async function runScheduledSync() {
  console.log(`[Scheduler] Starting scheduled daily metrics sync at 9:00 PM IST...`);
  try {
    const students = await db.getAllStudents();
    console.log(`[Scheduler] Syncing metrics for ${students.length} students...`);
    
    await logAdminAction('System Scheduler', `Started scheduled daily refresh for ${students.length} students.`);
    
    for (const student of students) {
      try {
        const stats = await fetchPlatformStats(student.roll, student.name, {
          leetcode: student.leetcode,
          hackerrank: student.hackerrank,
          codeforces: student.codeforces,
          gfg: student.gfg,
          codechef: student.codechef,
          github: student.github
        });
        const profileObj = {
          leetcode_url: student.leetcode || null,
          hackerrank_url: student.hackerrank || null,
          codeforces_url: student.codeforces || null,
          gfg_url: student.gfg || null,
          codechef_url: student.codechef || null,
          github_url: student.github || null,
          ...stats
        };
        await db.updateStudentProfile(student.roll, profileObj);
      } catch (e) {
        console.error(`[Scheduler] Sync failed for ${student.roll}:`, e.message);
      }
    }
    
    await logAdminAction('System Scheduler', `Completed scheduled daily refresh for ${students.length} students.`);
    console.log(`[Scheduler] Daily sync completed successfully.`);
  } catch (err) {
    console.error('[Scheduler] Scheduled sync error:', err);
  }
}

function startDailyScrapingScheduler() {
  const now = new Date();
  
  // Create target date for today at 15:30:00 UTC (9:00 PM IST)
  let target = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    15, 30, 0, 0
  ));
  
  // If 15:30 UTC has already passed today, set target to tomorrow
  if (now.getTime() >= target.getTime()) {
    target.setUTCDate(target.getUTCDate() + 1);
  }
  
  const delay = target.getTime() - now.getTime();
  const minutes = Math.round(delay / 1000 / 60);
  console.log(`[Scheduler] Daily scraping scheduled. Next run in ${minutes} minutes (at 9:00 PM IST / ${target.toUTCString()})`);
  
  setTimeout(() => {
    // Trigger sync
    runScheduledSync();
    
    // Repeat every 24 hours (86,400,000 milliseconds)
    setInterval(runScheduledSync, 24 * 60 * 60 * 1000);
  }, delay);
}

// Initialize database and start server
async function startServer() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    startDailyScrapingScheduler();
  });
}

startServer();
