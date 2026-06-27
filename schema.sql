-- Database schema for Code Tracker
CREATE DATABASE IF NOT EXISTS code_tracker;
USE code_tracker;

-- Users table storing credentials and roles
CREATE TABLE IF NOT EXISTS users (
  username VARCHAR(50) PRIMARY KEY,
  password VARCHAR(255) NOT NULL,
  role ENUM('student', 'hod', 'principal', 'admin') NOT NULL,
  name VARCHAR(100) NOT NULL,
  branch VARCHAR(10) NULL,
  email VARCHAR(100) NULL
);

-- Student profiles table storing links and coding stats
CREATE TABLE IF NOT EXISTS student_profiles (
  roll VARCHAR(50) PRIMARY KEY,
  email VARCHAR(100) NOT NULL,
  leetcode_url VARCHAR(255),
  hackerrank_url VARCHAR(255),
  codeforces_url VARCHAR(255),
  gfg_url VARCHAR(255),
  codechef_url VARCHAR(255),
  github_url VARCHAR(255),
  leetcode_solved INT DEFAULT 0,
  leetcode_rank VARCHAR(50) DEFAULT 'N/A',
  hackerrank_score INT DEFAULT 0,
  hackerrank_rank VARCHAR(50) DEFAULT 'N/A',
  codeforces_rating INT DEFAULT 0,
  codeforces_rank VARCHAR(50) DEFAULT 'N/A',
  gfg_solved INT DEFAULT 0,
  gfg_rank VARCHAR(50) DEFAULT 'N/A',
  codechef_solved INT DEFAULT 0,
  codechef_rank VARCHAR(50) DEFAULT 'N/A',
  github_repos INT DEFAULT 0,
  github_rank VARCHAR(50) DEFAULT 'N/A',
  total_score INT DEFAULT 0,
  batch_year INT DEFAULT 2026,
  FOREIGN KEY (roll) REFERENCES users(username) ON DELETE CASCADE
);

-- Seed Administrative Users (Admin, Principal, HODs)
INSERT INTO users (username, password, role, name, branch) VALUES
('admin@ideal.edu.in', 'admin123', 'admin', 'System Admin', NULL),
('principal@ideal.edu.in', 'principal123', 'principal', 'Principal Office', NULL),
('hod.cse@ideal.edu.in', 'hod.cse123', 'hod', 'CSE HOD', 'CSE'),
('hod.csm@ideal.edu.in', 'hod.csm123', 'hod', 'CSM HOD', 'CSM'),
('hod.aiml@ideal.edu.in', 'hod.aiml123', 'hod', 'AIML HOD', 'AIML'),
('hod.mech@ideal.edu.in', 'hod.mech123', 'hod', 'MECH HOD', 'MECH'),
('hod.ece@ideal.edu.in', 'hod.ece123', 'hod', 'ECE HOD', 'ECE')
ON DUPLICATE KEY UPDATE password=VALUES(password);

-- Audit logs for administration activities
CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL,
  action VARCHAR(255) NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notices / Announcements
CREATE TABLE IF NOT EXISTS notices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  priority ENUM('normal', 'imp', 'urgent') NOT NULL DEFAULT 'normal',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Student Assignments
CREATE TABLE IF NOT EXISTS assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  deadline VARCHAR(100) NOT NULL,
  target_batches VARCHAR(255) NOT NULL, -- comma separated list or "ALL"
  target_branches VARCHAR(255) NOT NULL, -- comma separated list or "ALL"
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Activity logs for student portal operations
CREATE TABLE IF NOT EXISTS activity_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL,
  action VARCHAR(255) NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

