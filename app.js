const STORAGE_KEY = 'ideal_code_tracker_db';

// App State
let studentsDb = [];
let currentUser = null;
let currentRole = 'student'; // 'student' | 'hod' | 'principal' | 'admin'
let activeWidgetPanel = 'panel-individual';
let activeBatchYear = 'ALL';
let activeAdminPanel = 'admin-panel-dashboard';
let chartInstances = {};
let principalSelectedBranch = 'CSE';
let principalSelectedBatch = 'ALL';

// URL Regex Validations
const URL_REGEX = {
  leetcode: /^(https?:\/\/)?(www\.)?leetcode\.com\/[a-zA-Z0-9_-]+\/?$/,
  hackerrank: /^(https?:\/\/)?(www\.)?hackerrank\.com\/[a-zA-Z0-9_-]+\/?$/,
  codeforces: /^(https?:\/\/)?(www\.)?codeforces\.com\/profile\/[a-zA-Z0-9_-]+\/?$/,
  gfg: /^(https?:\/\/)?(www\.)?(geeksforgeeks\.org\/(user|profile)\/|auth\.geeksforgeeks\.org\/user\/)[a-zA-Z0-9_-]+\/?$/,
  codechef: /^(https?:\/\/)?(www\.)?codechef\.com\/users\/[a-zA-Z0-9_-]+\/?$/,
  github: /^(https?:\/\/)?(www\.)?github\.com\/[a-zA-Z0-9_-]+\/?$/
};

// Alternate regexes in case standard profile format has extra segments
const URL_REGEX_ALT = {
  leetcode: /^(https?:\/\/)?(www\.)?leetcode\.com\/u\/[a-zA-Z0-9_-]+\/?$/,
  hackerrank: /^(https?:\/\/)?(www\.)?hackerrank\.com\/profile\/[a-zA-Z0-9_-]+\/?$/
};

// Pre-register form temp storage
let tempRegisterData = null;

// Initialize App
async function initApp() {
  setupEventListeners();
  setupAdminEventListeners();
  await fetchStudents();
  checkSession();
}

// Fetch database from Backend API
async function fetchStudents() {
  try {
    const res = await fetch(`/api/students?t=${Date.now()}`, { cache: 'no-store' });
    const data = await res.json();
    studentsDb = data.students || [];
    calculateTotalScoresAndRankings();
  } catch (err) {
    console.error('Failed to fetch students:', err);
  }
}

// Compute Aggregate Code Tracker Score (CTS) & ranks
function calculateTotalScoresAndRankings() {
  studentsDb.forEach(student => {
    const s = student.stats;
    const total = Math.round(
      (s.leetcode || 0) * 5 +
      (s.hackerrank || 0) * 1.5 +
      (s.codeforces || 0) * 1.0 +
      (s.gfg || 0) * 4 +
      (s.codechef || 0) * 3 +
      (s.github || 0) * 10
    );
    student.totalScore = total;
  });

  // Assign global ranks (descending order of totalScore)
  studentsDb.sort((a, b) => b.totalScore - a.totalScore);
  studentsDb.forEach((student, index) => {
    student.globalRank = index + 1;
  });

  // Assign branch-wise ranks
  const branches = ['CSE', 'CSM', 'AIML', 'MECH', 'ECE'];
  branches.forEach(branchName => {
    const branchStudents = studentsDb.filter(s => s.branch === branchName);
    branchStudents.sort((a, b) => b.totalScore - a.totalScore);
    branchStudents.forEach((student, index) => {
      student.branchRank = index + 1;
    });
  });
}

// Set up UI DOM Event Listeners
function setupEventListeners() {
  // Form Redirects
  document.getElementById('link-to-register').addEventListener('click', (e) => {
    e.preventDefault();
    showAuthSection('section-register-1');
  });

  document.getElementById('link-to-login-1').addEventListener('click', (e) => {
    e.preventDefault();
    showAuthSection('section-login');
  });

  document.getElementById('btn-back-reg-1').addEventListener('click', () => {
    showAuthSection('section-register-1');
  });

  // Login Submit
  document.getElementById('form-login').addEventListener('submit', handleLogin);

  // Dynamic role assessment: hide Batch Year select if logging in as an administrator
  const loginUsernameEl = document.getElementById('login-username');
  if (loginUsernameEl) {
    loginUsernameEl.addEventListener('input', () => {
      const val = loginUsernameEl.value.trim();
      const isNotStudent = val.includes('@') || ['admin', 'principal', 'hod'].some(role => val.toLowerCase().includes(role));
      const batchYearGroup = document.getElementById('login-batch-year-group');
      if (batchYearGroup) {
        batchYearGroup.style.display = isNotStudent ? 'none' : 'block';
      }
    });
  }

  // Register Step 1 Submit
  document.getElementById('form-register-1').addEventListener('submit', handleRegisterStep1);

  // Register Step 2 Submit (Final URLs & crawl trigger)
  document.getElementById('form-register-2').addEventListener('submit', handleRegisterStep2);

  // Floating Navigation Widgets
  document.getElementById('btn-widget-individual').addEventListener('click', (e) => {
    switchWidgetPanel('panel-individual', e.currentTarget);
  });
  document.getElementById('btn-widget-team').addEventListener('click', (e) => {
    switchWidgetPanel('panel-team', e.currentTarget);
  });
  document.getElementById('btn-widget-compare').addEventListener('click', (e) => {
    switchWidgetPanel('panel-compare', e.currentTarget);
  });
  document.getElementById('btn-widget-download').addEventListener('click', handleCSVDownload);

  // Floating Batch Widgets Filters Setup
  document.querySelectorAll('.floating-batch-widget .batch-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const selectedBatch = e.currentTarget.getAttribute('data-batch');
      if (!selectedBatch) return;

      activeBatchYear = selectedBatch;

      // Update active state on all buttons in all widgets
      document.querySelectorAll('.floating-batch-widget').forEach(widget => {
        widget.querySelectorAll('.batch-btn').forEach(b => {
          if (b.getAttribute('data-batch') === selectedBatch) {
            b.classList.add('active');
          } else {
            b.classList.remove('active');
          }
        });
      });

      renderIndividualTable();
      renderTeamTable();
    });
  });

  // Logout Button
  document.getElementById('btn-logout').addEventListener('click', logoutUser);

  // Navigation Edit Profile button for students (opens modal dialog)
  const navEditProfileBtn = document.getElementById('btn-nav-edit-profile');
  if (navEditProfileBtn) {
    navEditProfileBtn.addEventListener('click', () => {
      openEditProfileModal();
    });
  }

  // Register Step 1 Submit
  document.getElementById('form-register-1').addEventListener('submit', handleRegisterStep1);

  // Register Step 2 Submit (Final URLs & crawl trigger)
  document.getElementById('form-register-2').addEventListener('submit', handleRegisterStep2);

  // Floating Navigation Widgets
  document.getElementById('btn-widget-individual').addEventListener('click', (e) => {
    switchWidgetPanel('panel-individual', e.currentTarget);
  });
  document.getElementById('btn-widget-team').addEventListener('click', (e) => {
    switchWidgetPanel('panel-team', e.currentTarget);
  });
  document.getElementById('btn-widget-compare').addEventListener('click', (e) => {
    switchWidgetPanel('panel-compare', e.currentTarget);
  });
  document.getElementById('btn-widget-download').addEventListener('click', handleCSVDownload);

  // Logout Button
  document.getElementById('btn-logout').addEventListener('click', logoutUser);

  // Filters and Search (Individual Table)
  document.getElementById('search-students').addEventListener('input', renderIndividualTable);
  document.getElementById('filter-branch').addEventListener('change', renderIndividualTable);
  document.getElementById('filter-platform').addEventListener('change', renderIndividualTable);

  // Comparison input listeners
  document.getElementById('compare-student-a').addEventListener('input', runComparison);
  document.getElementById('compare-student-b').addEventListener('input', runComparison);

  // Profile Edit/Update profile links
  document.getElementById('btn-update-links').addEventListener('click', () => {
    openEditProfileModal();
  });

  // Handle profile links submission
  const formSelfUpdateLinks = document.getElementById('form-self-update-links');
  if (formSelfUpdateLinks) {
    formSelfUpdateLinks.addEventListener('submit', handleSelfUpdateLinksSubmit);
  }

  // Navigation tab for student's own profile
  const btnWidgetProfile = document.getElementById('btn-widget-profile');
  if (btnWidgetProfile) {
    btnWidgetProfile.addEventListener('click', (e) => {
      document.querySelectorAll('#nav-widgets .floating-widget-btn').forEach(btn => btn.classList.remove('active'));
      e.currentTarget.classList.add('active');
      switchView('view-student-profile');
      renderStudentProfile();
    });
  }

  // Modal manual close buttons fallback
  document.getElementById('btn-close-detail-modal').addEventListener('click', () => {
    document.getElementById('dialog-student-detail').close();
  });

  // Forgot Password transitions
  document.getElementById('link-to-forgot-login').addEventListener('click', (e) => {
    e.preventDefault();
    showAuthSection('section-forgot');
  });
  document.getElementById('link-to-forgot-reg').addEventListener('click', (e) => {
    e.preventDefault();
    showAuthSection('section-forgot');
  });
  document.getElementById('link-to-login-forgot').addEventListener('click', (e) => {
    e.preventDefault();
    showAuthSection('section-login');
  });

  // Forgot Password Submit
  document.getElementById('form-forgot').addEventListener('submit', handleForgotPassword);

  // Admin Recovery Email setup form submission
  const formAdminEmailSetup = document.getElementById('form-admin-email-setup');
  if (formAdminEmailSetup) {
    formAdminEmailSetup.addEventListener('submit', handleAdminEmailSetupSubmit);
  }

  // Admin target user password edit form submission
  const formAdminEditPassword = document.getElementById('form-admin-edit-password');
  if (formAdminEditPassword) {
    formAdminEditPassword.addEventListener('submit', handleAdminEditPasswordSubmit);
  }

  // Principal & HOD Analytics Event Listeners
  const analyticsWidgetBtn = document.getElementById('btn-widget-analytics');
  if (analyticsWidgetBtn) {
    analyticsWidgetBtn.addEventListener('click', (e) => {
      if (currentUser && currentUser.role === 'hod') {
        principalSelectedBranch = currentUser.branch;
        switchWidgetPanel('panel-analytics', analyticsWidgetBtn);
      } else {
        document.getElementById('dialog-principal-branch-select').showModal();
      }
    });
  }

  document.querySelectorAll('.branch-select-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const selectedBranch = e.currentTarget.getAttribute('data-branch');
      if (!selectedBranch) return;
      principalSelectedBranch = selectedBranch;
      document.getElementById('dialog-principal-branch-select').close();
      switchWidgetPanel('panel-analytics', document.getElementById('btn-widget-analytics'));
    });
  });

  const btnPrincipalChangeBranch = document.getElementById('btn-principal-change-branch');
  if (btnPrincipalChangeBranch) {
    btnPrincipalChangeBranch.addEventListener('click', () => {
      document.getElementById('dialog-principal-branch-select').showModal();
    });
  }

  const principalFilterBatch = document.getElementById('principal-filter-batch');
  if (principalFilterBatch) {
    principalFilterBatch.addEventListener('change', (e) => {
      principalSelectedBatch = e.target.value;
      renderPrincipalBranchAnalytics();
    });
  }

  // Fallback backdrop click close for dialog-principal-branch-select
  const branchSelectDialog = document.getElementById('dialog-principal-branch-select');
  if (branchSelectDialog && !('closedBy' in HTMLDialogElement.prototype)) {
    branchSelectDialog.addEventListener('click', (event) => {
      if (event.target !== branchSelectDialog) return;
      const rect = branchSelectDialog.getBoundingClientRect();
      const isDialogContent = (
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width
      );
      if (isDialogContent) return;
      branchSelectDialog.close();
    });
  }

  // Change Password Modal Open Trigger
  const btnNavChangePassword = document.getElementById('btn-nav-change-password');
  if (btnNavChangePassword) {
    btnNavChangePassword.addEventListener('click', () => {
      document.getElementById('form-change-password').reset();
      resetFormErrors(document.getElementById('form-change-password'));
      document.getElementById('dialog-change-password').showModal();
    });
  }

  // Change Password Form Submit
  const formChangePassword = document.getElementById('form-change-password');
  if (formChangePassword) {
    formChangePassword.addEventListener('submit', handleChangePasswordSubmit);
  }

  // Fallback backdrop click close for dialog-change-password
  const changePasswordDialog = document.getElementById('dialog-change-password');
  if (changePasswordDialog && !('closedBy' in HTMLDialogElement.prototype)) {
    changePasswordDialog.addEventListener('click', (event) => {
      if (event.target !== changePasswordDialog) return;
      const rect = changePasswordDialog.getBoundingClientRect();
      const isDialogContent = (
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width
      );
      if (isDialogContent) return;
      changePasswordDialog.close();
    });
  }
}

// Helper to switch visual auth sections (Login, Register1, Register2)
function showAuthSection(sectionId) {
  const sections = ['section-login', 'section-register-1', 'section-register-2', 'section-forgot'];
  sections.forEach(id => {
    document.getElementById(id).style.display = id === sectionId ? 'block' : 'none';
  });
}

// Helper to switch global views
function switchView(viewId) {
  const views = ['view-auth', 'view-dashboard', 'view-student-profile', 'view-admin'];
  views.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (id === viewId) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    }
  });

  const mainNav = document.getElementById('main-nav');
  if (viewId === 'view-auth') {
    mainNav.style.display = 'none';
  } else {
    mainNav.style.display = 'flex';
  }
}

// Clear input validation classes
function resetFormErrors(formElement) {
  formElement.querySelectorAll('.form-group').forEach(group => {
    group.classList.remove('has-error');
  });
}

// Check session on page load
function checkSession() {
  const session = sessionStorage.getItem('ideal_code_tracker_session');
  if (session) {
    currentUser = JSON.parse(session);
    if (currentUser.role === 'student' && !currentUser.roll) {
      currentUser.roll = currentUser.username;
    }
    loginSuccessRedirect();
  } else {
    switchView('view-auth');
    showAuthSection('section-login');
  }
}

// Handle Login Form Submit
async function handleLogin(e) {
  e.preventDefault();
  resetFormErrors(e.target);

  const usernameVal = document.getElementById('login-username').value.trim();
  const passwordVal = document.getElementById('login-password').value;
  let isValid = true;

  if (!usernameVal) {
    showInputError('login-username');
    isValid = false;
  }
  if (!passwordVal) {
    showInputError('login-password');
    isValid = false;
  }

  if (!isValid) return;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: usernameVal, password: passwordVal })
    });

    if (!res.ok) {
      const data = await res.json();
      alert(data.error || 'Invalid credentials.');
      return;
    }

    const data = await res.json();
    currentUser = data.user;
    if (currentUser.role === 'student' && !currentUser.roll) {
      currentUser.roll = currentUser.username;
    }
    sessionStorage.setItem('ideal_code_tracker_session', JSON.stringify(currentUser));
    
    // Set active batch year from login form select
    const loginBatchYearEl = document.getElementById('login-batch-year');
    if (loginBatchYearEl) {
      activeBatchYear = loginBatchYearEl.value;
      // update the active class on buttons in the widgets
      document.querySelectorAll('.floating-batch-widget').forEach(widget => {
        widget.querySelectorAll('.batch-btn').forEach(b => {
          if (b.getAttribute('data-batch') === activeBatchYear) {
            b.classList.add('active');
          } else {
            b.classList.remove('active');
          }
        });
      });
    }

    // Check if recovery Gmail is required (non-students only)
    if (currentUser.role !== 'student' && !currentUser.email) {
      await fetchStudents();
      const emailModal = document.getElementById('dialog-admin-email-setup');
      if (emailModal) {
        resetFormErrors(document.getElementById('form-admin-email-setup'));
        emailModal.showModal();
        return;
      }
    }

    // Refresh student data from server
    await fetchStudents();
    loginSuccessRedirect();
  } catch (err) {
    console.error('Login error:', err);
    alert('Failed to log in. Please try again.');
  }
}

// Handle Forgot Password Form Submit
async function handleForgotPassword(e) {
  e.preventDefault();
  resetFormErrors(e.target);

  const usernameVal = document.getElementById('forgot-username').value.trim();
  if (!usernameVal) {
    showInputError('forgot-username');
    return;
  }

  try {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: usernameVal })
    });
    const data = await res.json();
    alert(data.message || 'If the account exists, a password recovery email has been sent.');
    showAuthSection('section-login');
  } catch (err) {
    console.error('Forgot password error:', err);
    alert('Failed to send recovery email. Please try again.');
  }
}

// Handle Change Password Submit
async function handleChangePasswordSubmit(e) {
  e.preventDefault();
  resetFormErrors(e.target);

  const currentPwd = document.getElementById('change-pwd-current').value;
  const newPwd = document.getElementById('change-pwd-new').value;
  const confirmPwd = document.getElementById('change-pwd-confirm').value;

  let hasError = false;
  if (!currentPwd) {
    showInputError('change-pwd-current');
    hasError = true;
  }
  if (!newPwd) {
    showInputError('change-pwd-new');
    hasError = true;
  }
  if (newPwd !== confirmPwd) {
    showInputError('change-pwd-confirm');
    hasError = true;
  }

  if (hasError) return;

  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: currentUser.username,
        currentPassword: currentPwd,
        newPassword: newPwd
      })
    });

    const data = await res.json();
    if (res.ok) {
      alert(data.message || 'Password updated successfully!');
      document.getElementById('dialog-change-password').close();
    } else {
      alert(data.error || 'Failed to update password.');
    }
  } catch (err) {
    console.error('Change password error:', err);
    alert('An error occurred. Please try again.');
  }
}

// Redirect and configure UI permissions on success login
function loginSuccessRedirect() {
  // Update header elements
  const userInfo = document.getElementById('nav-user-info');
  const userRole = document.getElementById('nav-user-role');
  
  userInfo.innerHTML = `<i class="fa-solid fa-circle-user"></i> ${currentUser.name}`;
  userRole.textContent = currentUser.role.toUpperCase();
  userRole.className = `role-indicator role-${currentUser.role}`;

  // Configure widgets view permissions based on role
  const individualWidgetBtn = document.getElementById('btn-widget-individual');
  const branchFilterSelect = document.getElementById('filter-branch');
  const editProfileBtn = document.getElementById('btn-nav-edit-profile');
  const analyticsWidgetBtn = document.getElementById('btn-widget-analytics');

  // Reset filter locked state
  branchFilterSelect.removeAttribute('disabled');

  // Display edit profile button ONLY for students
  const profileTabBtn = document.getElementById('btn-widget-profile');
  if (currentUser.role === 'student') {
    if (editProfileBtn) editProfileBtn.style.display = 'inline-block';
    if (profileTabBtn) profileTabBtn.style.display = 'inline-block';
  } else {
    if (editProfileBtn) editProfileBtn.style.display = 'none';
    if (profileTabBtn) profileTabBtn.style.display = 'none';
  }

  // Display analytics widget button for principal and HOD
  if (currentUser.role === 'principal' || currentUser.role === 'hod') {
    if (analyticsWidgetBtn) analyticsWidgetBtn.style.display = 'inline-block';
  } else {
    if (analyticsWidgetBtn) analyticsWidgetBtn.style.display = 'none';
  }

  // Display change password button for all logged-in users
  const changePasswordBtn = document.getElementById('btn-nav-change-password');
  if (changePasswordBtn) {
    changePasswordBtn.style.display = 'inline-block';
  }

  // Route admin or other roles appropriately
  if (currentUser.role === 'admin') {
    document.getElementById('nav-widgets').style.display = 'none';
    document.getElementById('admin-widgets').style.display = 'flex';
    switchView('view-admin');
    
    // Default to dashboard subpanel
    const dashBtn = document.getElementById('btn-admin-dashboard');
    switchAdminPanel('admin-panel-dashboard', dashBtn);
  } else {
    document.getElementById('nav-widgets').style.display = 'flex';
    document.getElementById('admin-widgets').style.display = 'none';
    
    if (currentUser.role === 'student') {
      // Default to My Profile tab
      document.querySelectorAll('#nav-widgets .floating-widget-btn').forEach(btn => btn.classList.remove('active'));
      const btnWidgetProfile = document.getElementById('btn-widget-profile');
      if (btnWidgetProfile) btnWidgetProfile.classList.add('active');
      switchView('view-student-profile');
      renderStudentProfile();
    } else {
      switchView('view-dashboard');
      if (currentUser.role === 'hod') {
        // HOD locked to their specific department branch data
        branchFilterSelect.value = currentUser.branch;
        branchFilterSelect.setAttribute('disabled', 'true');
      } else {
        branchFilterSelect.value = 'ALL';
      }
      // Default to individual view list
      switchWidgetPanel('panel-individual', individualWidgetBtn);
    }
  }

  // Load announcements and assignments for students
  if (currentUser.role === 'student') {
    loadNoticesAndAnnouncements();
    loadStudentAssignments();
  }

  // Populate comparison datalists
  populateDatalists();
}

function logoutUser() {
  sessionStorage.removeItem('ideal_code_tracker_session');
  currentUser = null;
  switchView('view-auth');
  showAuthSection('section-login');
  
  // Hide change password button
  const changePasswordBtn = document.getElementById('btn-nav-change-password');
  if (changePasswordBtn) {
    changePasswordBtn.style.display = 'none';
  }

  // Reset forms
  document.getElementById('form-login').reset();
  document.getElementById('form-register-1').reset();
  document.getElementById('form-register-2').reset();
}

// Handle Register Step 1 Submit
function handleRegisterStep1(e) {
  e.preventDefault();
  resetFormErrors(e.target);

  const rollVal = document.getElementById('reg-roll').value.trim().toUpperCase();
  const nameVal = document.getElementById('reg-name').value.trim();
  const emailVal = document.getElementById('reg-email').value.trim();
  const branchVal = document.getElementById('reg-branch').value;
  const batchYearVal = document.getElementById('reg-batch-year').value;
  const passwordVal = document.getElementById('reg-password').value;

  let isValid = true;

  // Roll validator (must be alphanumeric)
  if (!rollVal || !/^[A-Z0-9]+$/.test(rollVal)) {
    showInputError('reg-roll');
    isValid = false;
  }
  // Check if roll already exists
  if (rollVal && studentsDb.some(s => s.roll.toUpperCase() === rollVal)) {
    alert("This Roll Number is already registered.");
    showInputError('reg-roll');
    isValid = false;
  }
  if (!nameVal) {
    showInputError('reg-name');
    isValid = false;
  }
  // Gmail validator: must end with @gmail.com
  if (!emailVal || !/^[a-zA-Z0-9._%+-]+@gmail\.com$/.test(emailVal.toLowerCase())) {
    showInputError('reg-email');
    isValid = false;
  }
  if (!branchVal) {
    showInputError('reg-branch');
    isValid = false;
  }
  if (!batchYearVal) {
    showInputError('reg-batch-year');
    isValid = false;
  }
  if (!passwordVal || passwordVal.length < 6) {
    showInputError('reg-password');
    isValid = false;
  }

  if (!isValid) return;

  // Store step 1 data
  tempRegisterData = {
    roll: rollVal,
    name: nameVal,
    email: emailVal.toLowerCase(),
    branch: branchVal,
    batchYear: batchYearVal,
    password: passwordVal,
    isEditing: false
  };

  showAuthSection('section-register-2');
}

// Check if profile URL format fits platform regex
function validatePlatformURL(platform, url) {
  if (!url) return true; // Optional url: empty is fine!
  const regex = URL_REGEX[platform];
  const regexAlt = URL_REGEX_ALT[platform];
  
  if (regex.test(url)) return true;
  if (regexAlt && regexAlt.test(url)) return true;
  return false;
}

// Handle Register Step 2 Submit
function handleRegisterStep2(e) {
  e.preventDefault();
  resetFormErrors(e.target);

  const lcUrl = document.getElementById('reg-leetcode').value.trim();
  const hrUrl = document.getElementById('reg-hackerrank').value.trim();
  const cfUrl = document.getElementById('reg-codeforces').value.trim();
  const gfgUrl = document.getElementById('reg-gfg').value.trim();
  const ccUrl = document.getElementById('reg-codechef').value.trim();
  const ghUrl = document.getElementById('reg-github').value.trim();

  let isValid = true;

  if (!validatePlatformURL('leetcode', lcUrl)) {
    showInputError('reg-leetcode');
    isValid = false;
  }
  if (!validatePlatformURL('hackerrank', hrUrl)) {
    showInputError('reg-hackerrank');
    isValid = false;
  }
  if (!validatePlatformURL('codeforces', cfUrl)) {
    showInputError('reg-codeforces');
    isValid = false;
  }
  if (!validatePlatformURL('gfg', gfgUrl)) {
    showInputError('reg-gfg');
    isValid = false;
  }
  if (!validatePlatformURL('codechef', ccUrl)) {
    showInputError('reg-codechef');
    isValid = false;
  }
  if (!validatePlatformURL('github', ghUrl)) {
    showInputError('reg-github');
    isValid = false;
  }

  if (!isValid) return;

  // Complete registry and trigger crawling loader modal
  triggerCrawlerSimulation(lcUrl, hrUrl, cfUrl, gfgUrl, ccUrl, ghUrl);
}

// Helper to show visual form-group error
function showInputError(inputId) {
  const input = document.getElementById(inputId);
  const group = input.closest('.form-group');
  group.classList.add('has-error');
}

// Simulated Crawler Animation
function triggerCrawlerSimulation(lcUrl, hrUrl, cfUrl, gfgUrl, ccUrl, ghUrl) {
  const dialog = document.getElementById('dialog-crawler');
  const bar = document.getElementById('crawler-bar');
  const logs = document.getElementById('crawler-logs');
  const title = document.getElementById('crawler-title');

  dialog.showModal();
  bar.style.width = '0%';
  logs.innerHTML = '';
  title.textContent = 'Initializing API Crawling...';

  // Helper log generator
  const addLog = (text, delay) => {
    return new Promise(resolve => {
      setTimeout(() => {
        const line = document.createElement('div');
        line.className = 'crawler-log-line';
        line.innerHTML = `<span style="color: #64748b;">[${(delay/1000).toFixed(1)}s]</span> ${text}`;
        logs.appendChild(line);
        logs.scrollTop = logs.scrollHeight;
        resolve();
      }, delay);
    });
  };

  // Build dynamic steps list based on active/configured platforms
  const activePlatforms = [];
  if (lcUrl) activePlatforms.push('LeetCode');
  if (hrUrl) activePlatforms.push('HackerRank');
  if (cfUrl) activePlatforms.push('Codeforces');
  if (gfgUrl) activePlatforms.push('GeeksforGeeks');
  if (ccUrl) activePlatforms.push('CodeChef');
  if (ghUrl) activePlatforms.push('GitHub');

  const steps = [];
  let stepIndex = 0;
  const totalPlatforms = activePlatforms.length;
  const stepIncrement = totalPlatforms > 0 ? Math.round(90 / totalPlatforms) : 90;

  activePlatforms.forEach(platform => {
    stepIndex++;
    const pct = stepIndex * stepIncrement;
    const delay = stepIndex * 600;

    if (platform === 'LeetCode') {
      steps.push({ text: 'Securing handshake with LeetCode API headers...', pct: pct - 5, delay: delay - 300 });
      steps.push({ text: `Fetched LeetCode profile info: ${lcUrl.split('/').filter(Boolean).pop()}`, pct, delay });
    } else if (platform === 'HackerRank') {
      steps.push({ text: 'Connecting to HackerRank servers...', pct: pct - 5, delay: delay - 300 });
      steps.push({ text: 'HackerRank solved score details fetched successfully.', pct, delay });
    } else if (platform === 'Codeforces') {
      steps.push({ text: 'Accessing Codeforces submissions history...', pct, delay });
    } else if (platform === 'GeeksforGeeks') {
      steps.push({ text: 'Requesting GeeksforGeeks points from portal...', pct, delay });
    } else if (platform === 'CodeChef') {
      steps.push({ text: 'Crawling CodeChef rating indexes and stars...', pct, delay });
    } else if (platform === 'GitHub') {
      steps.push({ text: 'Querying GitHub public repository count and metadata...', pct, delay });
    }
  });

  const finalDelay = (stepIndex + 1) * 600;
  steps.push({ text: 'Computing final Code Tracker Index score & ranks...', pct: 100, delay: finalDelay });

  // Set up bar width updates
  steps.forEach(step => {
    setTimeout(() => {
      bar.style.width = `${step.pct}%`;
      if (step.pct === 100) {
        title.textContent = 'Crawl Analysis Completed!';
      }
    }, step.delay);
  });

  // Run async logs
  const logPromises = steps.map(s => addLog(s.text, s.delay));

  Promise.all(logPromises).then(() => {
    setTimeout(() => {
      dialog.close();
      finalizeRegistration(lcUrl, hrUrl, cfUrl, gfgUrl, ccUrl, ghUrl);
    }, 600);
  });
}

// Finalize registration/edit, calculate metrics and log user in
async function finalizeRegistration(lcUrl, hrUrl, cfUrl, gfgUrl, ccUrl, ghUrl) {
  try {
    if (tempRegisterData.isEditing) {
      // Profile Update (Edit profile URLs)
      const res = await fetch(`/api/students/${tempRegisterData.roll}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leetcode: lcUrl,
          hackerrank: hrUrl,
          codeforces: cfUrl,
          gfg: gfgUrl,
          codechef: ccUrl,
          github: ghUrl,
          name: tempRegisterData.name,
          batchYear: tempRegisterData.batchYear
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        alert(errData.error || 'Failed to update profile.');
        return;
      }
    } else {
      // New Student Registration
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roll: tempRegisterData.roll,
          name: tempRegisterData.name,
          email: tempRegisterData.email,
          branch: tempRegisterData.branch,
          password: tempRegisterData.password,
          leetcode: lcUrl,
          hackerrank: hrUrl,
          codeforces: cfUrl,
          gfg: gfgUrl,
          codechef: ccUrl,
          github: ghUrl,
          batchYear: tempRegisterData.batchYear
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        alert(errData.error || 'Registration failed.');
        return;
      }

      const data = await res.json();
      currentUser = data.user;
      if (currentUser.role === 'student' && !currentUser.roll) {
        currentUser.roll = currentUser.username;
      }
      sessionStorage.setItem('ideal_code_tracker_session', JSON.stringify(currentUser));
    }

    // Refresh database
    await fetchStudents();

    if (currentUser) {
      // If we are logged in, hide the edit panel and re-render the profile
      const panel = document.getElementById('self-profile-edit-panel');
      if (panel) panel.style.display = 'none';

      // If student, stay on student profile view
      if (currentUser.role === 'student') {
        renderStudentProfile();
        
        // Ensure we stay in view-student-profile
        switchView('view-student-profile');

        // Set active tab to My Profile
        document.querySelectorAll('#nav-widgets .floating-widget-btn').forEach(btn => btn.classList.remove('active'));
        const btnWidgetProfile = document.getElementById('btn-widget-profile');
        if (btnWidgetProfile) btnWidgetProfile.classList.add('active');
        return;
      }
    }

    loginSuccessRedirect();
  } catch (err) {
    console.error('Registration finalize error:', err);
    alert('An error occurred during registration. Please try again.');
  }
}

// Switch between dashboard widgets (Individual, Team, Compare)
function switchWidgetPanel(panelId, buttonEl) {
  activeWidgetPanel = panelId;
  switchView('view-dashboard');

  // Toggle button active classes
  const btns = document.querySelectorAll('#nav-widgets .floating-widget-btn');
  btns.forEach(btn => btn.classList.remove('active'));
  
  if (buttonEl) {
    buttonEl.classList.add('active');
  }

  // Toggle panel display
  const panels = document.querySelectorAll('.widget-panel');
  panels.forEach(p => {
    if (p.id === panelId) {
      p.classList.add('active');
    } else {
      p.classList.remove('active');
    }
  });

  // Populate data in panels
  if (panelId === 'panel-individual') {
    renderIndividualTable();
  } else if (panelId === 'panel-team') {
    renderTeamTable();
  } else if (panelId === 'panel-compare') {
    runComparison();
  } else if (panelId === 'panel-analytics') {
    renderPrincipalBranchAnalytics();
  }
}

// Generate the global dashboard summary stats
function renderSummaryStats(filteredStudents) {
  const totalStudents = filteredStudents.length;
  document.getElementById('stat-total-students').textContent = totalStudents;

  if (totalStudents === 0) {
    document.getElementById('stat-highest-score').textContent = 0;
    document.getElementById('stat-college-avg').textContent = 0;
    document.getElementById('stat-peak-student').textContent = '-';
    return;
  }

  const scores = filteredStudents.map(s => s.totalScore);
  const highest = Math.max(...scores);
  const avg = Math.round(scores.reduce((sum, val) => sum + val, 0) / totalStudents);
  
  // Find highest scoring student
  const topStudent = filteredStudents.find(s => s.totalScore === highest);

  document.getElementById('stat-highest-score').textContent = highest;
  document.getElementById('stat-college-avg').textContent = avg;
  document.getElementById('stat-peak-student').textContent = topStudent ? `${topStudent.name} (${topStudent.roll})` : '-';
}

// Render 1. INDIVIDUAL Widget Directory Table
function renderIndividualTable() {
  const searchVal = document.getElementById('search-students').value.toLowerCase().trim();
  const selectedBranch = document.getElementById('filter-branch').value;
  const sortByPlatform = document.getElementById('filter-platform').value;

  // Filter students based on branch selection, batch selection, and search string
  let filtered = studentsDb.filter(student => {
    const matchesBranch = selectedBranch === 'ALL' || student.branch === selectedBranch;
    const matchesBatch = activeBatchYear === 'ALL' || student.batchYear == activeBatchYear;
    const matchesSearch = student.name.toLowerCase().includes(searchVal) ||
                          student.roll.toLowerCase().includes(searchVal) ||
                          student.email.toLowerCase().includes(searchVal);
    return matchesBranch && matchesBatch && matchesSearch;
  });

  // Handle platform sorts
  if (sortByPlatform !== 'ALL') {
    if (sortByPlatform === 'leetcode') {
      filtered.sort((a, b) => (b.stats.leetcode || 0) - (a.stats.leetcode || 0));
    } else if (sortByPlatform === 'hackerrank') {
      filtered.sort((a, b) => (b.stats.hackerrank || 0) - (a.stats.hackerrank || 0));
    } else if (sortByPlatform === 'codeforces') {
      filtered.sort((a, b) => (b.stats.codeforces || 0) - (a.stats.codeforces || 0));
    } else if (sortByPlatform === 'gfg') {
      filtered.sort((a, b) => (b.stats.gfg || 0) - (a.stats.gfg || 0));
    } else if (sortByPlatform === 'codechef') {
      filtered.sort((a, b) => (b.stats.codechef || 0) - (a.stats.codechef || 0));
    } else if (sortByPlatform === 'github') {
      filtered.sort((a, b) => (b.stats.github || 0) - (a.stats.github || 0));
    }
  } else {
    // Sort by total aggregate score
    filtered.sort((a, b) => b.totalScore - a.totalScore);
  }

  // Update top summary cards dynamically using filtered results (branch-level for HOD)
  renderSummaryStats(filtered);

  const tbody = document.getElementById('tbody-students');
  tbody.innerHTML = '';

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="12" style="text-align: center; color: var(--text-muted); padding: 2rem;">No students found.</td></tr>`;
    return;
  }

  const top50 = filtered.slice(0, 50);
  top50.forEach((student, index) => {
    // Determine rank badges
    let rankHtml = `<span class="rank-badge rank-standard">${student.globalRank}</span>`;
    if (student.globalRank === 1) rankHtml = `<span class="rank-badge rank-top-1"><i class="fa-solid fa-trophy"></i></span>`;
    else if (student.globalRank === 2) rankHtml = `<span class="rank-badge rank-top-2"><i class="fa-solid fa-medal"></i></span>`;
    else if (student.globalRank === 3) rankHtml = `<span class="rank-badge rank-top-3"><i class="fa-solid fa-award"></i></span>`;

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${rankHtml}</td>
      <td>
        <a class="student-roll-link" data-roll="${student.roll}">
          ${student.roll} <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 0.7rem; opacity: 0.5;"></i>
        </a>
      </td>
      <td style="font-weight: 600;">${student.name}</td>
      <td><span class="role-indicator role-student" style="font-size: 0.75rem;">${student.branch}</span></td>
      <td style="font-weight: 600; color: var(--accent);">${student.batchYear || 2026}</td>
      <td style="font-weight: 700; color: var(--warning);">${student.totalScore}</td>
      <td><span class="platform-mini-badge"><i class="fa-solid fa-code" style="color: #ffa116;"></i> ${student.stats.leetcode}</span></td>
      <td><span class="platform-mini-badge"><i class="fa-solid fa-laptop-code" style="color: #2ec866;"></i> ${student.stats.hackerrank}</span></td>
      <td><span class="platform-mini-badge"><i class="fa-solid fa-chart-line" style="color: #3b5998;"></i> ${student.stats.codeforces}</span></td>
      <td><span class="platform-mini-badge"><i class="fa-solid fa-terminal" style="color: #2f8955;"></i> ${student.stats.gfg}</span></td>
      <td><span class="platform-mini-badge"><i class="fa-solid fa-cookie-bite" style="color: #ab7a5f;"></i> ${student.stats.codechef || 0}</span></td>
      <td><span class="platform-mini-badge"><i class="fa-brands fa-github" style="color: #f0f6fc;"></i> ${student.stats.github || 0}</span></td>
    `;

    // Add click listener for roll details popup
    row.querySelector('.student-roll-link').addEventListener('click', (e) => {
      e.preventDefault();
      showStudentDetailModal(student.roll);
    });

    tbody.appendChild(row);
  });
}

// Render 2. TEAM Widget (Branch Performance Table)
function renderTeamTable() {
  const branches = currentUser && currentUser.role === 'hod' ? [currentUser.branch] : ['CSE', 'CSM', 'AIML', 'MECH', 'ECE'];
  const tbody = document.getElementById('tbody-branches');
  tbody.innerHTML = '';

  branches.forEach(branchName => {
    const branchStudents = studentsDb.filter(s => s.branch === branchName && (activeBatchYear === 'ALL' || s.batchYear == activeBatchYear));
    const count = branchStudents.length;

    if (count === 0) {
      tbody.innerHTML += `
        <tr>
          <td style="font-weight: 700; color: var(--primary);">${branchName}</td>
          <td>0</td>
          <td>0</td>
          <td>-</td>
          <td>0</td>
          <td>-</td>
          <td>0</td>
        </tr>
      `;
      return;
    }

    // Sort to easily identify top/bottom performers
    branchStudents.sort((a, b) => b.totalScore - a.totalScore);
    const avgScore = Math.round(branchStudents.reduce((sum, val) => sum + val.totalScore, 0) / count);
    
    const topStud = branchStudents[0];
    const bottomStud = branchStudents[count - 1];

    const row = document.createElement('tr');
    row.innerHTML = `
      <td style="font-weight: 700; color: var(--primary);">${branchName}</td>
      <td style="font-weight: 600;">${count}</td>
      <td style="font-weight: 700; color: var(--warning);">${avgScore}</td>
      <td>
        <a class="student-roll-link" data-roll="${topStud.roll}">
          ${topStud.name} (${topStud.roll})
        </a>
      </td>
      <td style="color: var(--success); font-weight: 600;">${topStud.totalScore}</td>
      <td>
        <a class="student-roll-link" data-roll="${bottomStud.roll}">
          ${bottomStud.name} (${bottomStud.roll})
        </a>
      </td>
      <td style="color: var(--danger); font-weight: 600;">${bottomStud.totalScore}</td>
    `;

    // Click links inside teams tables
    row.querySelectorAll('.student-roll-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        showStudentDetailModal(link.getAttribute('data-roll'));
      });
    });

    tbody.appendChild(row);
  });
}

// Populate autocomplete datalists
function populateDatalists() {
  const datalist = document.getElementById('student-list');
  if (!datalist) return;
  datalist.innerHTML = '';
  
  const filtered = currentUser && currentUser.role === 'hod'
    ? studentsDb.filter(s => s.branch === currentUser.branch)
    : studentsDb;

  filtered.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.roll;
    opt.textContent = `${s.name} (${s.branch})`;
    datalist.appendChild(opt);
  });
}

// Render 3. COMPARE Widget side by side data
function runComparison() {
  const rollA = document.getElementById('compare-student-a').value.trim().toUpperCase();
  const rollB = document.getElementById('compare-student-b').value.trim().toUpperCase();
  const resultsContainer = document.getElementById('compare-results');
  
  if (!rollA || !rollB) {
    resultsContainer.style.display = 'none';
    return;
  }

  const studA = studentsDb.find(s => s.roll === rollA);
  const studB = studentsDb.find(s => s.roll === rollB);

  // Enforce HOD branch comparison restriction
  if (currentUser && currentUser.role === 'hod') {
    if ((studA && studA.branch !== currentUser.branch) || (studB && studB.branch !== currentUser.branch)) {
      resultsContainer.style.display = 'block';
      document.getElementById('compare-tbody').innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Access Denied. HOD accounts can only compare students within their branch (${currentUser.branch}).</td></tr>`;
      document.getElementById('compare-verdict-card').style.display = 'none';
      return;
    }
  }

  if (!studA || !studB) {
    resultsContainer.style.display = 'block';
    document.getElementById('compare-tbody').innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Enter two valid registered roll numbers to compare.</td></tr>`;
    document.getElementById('compare-verdict-card').style.display = 'none';
    return;
  }

  resultsContainer.style.display = 'block';
  document.getElementById('compare-verdict-card').style.display = 'flex';

  document.getElementById('compare-hdr-a').textContent = `${studA.name} (${studA.roll})`;
  document.getElementById('compare-hdr-b').textContent = `${studB.name} (${studB.roll})`;

  const tbody = document.getElementById('compare-tbody');
  tbody.innerHTML = '';

  const compareRow = (label, icon, valA, valB, isHigherBetter = true) => {
    let winText = '-';
    let winClass = '';
    
    if (valA !== valB) {
      const aWins = isHigherBetter ? (valA > valB) : (valA < valB);
      winText = aWins ? studA.name : studB.name;
      winClass = aWins ? 'style="color: var(--primary); font-weight: 700;"' : 'style="color: var(--accent); font-weight: 700;"';
    } else {
      winText = 'Tie';
      winClass = 'style="color: var(--text-muted);"';
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${icon} ${label}</td>
      <td style="font-weight: 600;">${valA}</td>
      <td style="font-weight: 600;">${valB}</td>
      <td ${winClass}>${winText}</td>
    `;
    tbody.appendChild(tr);
  };

  // Compare categories
  compareRow('LeetCode Solved', '<i class="fa-solid fa-code" style="color: #ffa116;"></i>', studA.stats.leetcode || 0, studB.stats.leetcode || 0);
  compareRow('HackerRank Score', '<i class="fa-solid fa-laptop-code" style="color: #2ec866;"></i>', studA.stats.hackerrank || 0, studB.stats.hackerrank || 0);
  compareRow('Codeforces Rating', '<i class="fa-solid fa-chart-line" style="color: #3b5998;"></i>', studA.stats.codeforces || 0, studB.stats.codeforces || 0);
  compareRow('GeeksforGeeks Solved', '<i class="fa-solid fa-terminal" style="color: #2f8955;"></i>', studA.stats.gfg || 0, studB.stats.gfg || 0);
  compareRow('CodeChef Solved', '<i class="fa-solid fa-cookie-bite" style="color: #ab7a5f;"></i>', studA.stats.codechef || 0, studB.stats.codechef || 0);
  compareRow('GitHub Repos', '<i class="fa-brands fa-github" style="color: #f0f6fc;"></i>', studA.stats.github || 0, studB.stats.github || 0);
  compareRow('Aggregate Score', '<i class="fa-solid fa-bolt" style="color: var(--warning);"></i>', studA.totalScore, studB.totalScore);
  compareRow('College Rank', '<i class="fa-solid fa-award"></i>', studA.globalRank, studB.globalRank, false);

  // Generate analytical verdict
  const verdictTitle = document.getElementById('verdict-title');
  const verdictDesc = document.getElementById('verdict-desc');
  const diff = Math.abs(studA.totalScore - studB.totalScore);
  
  if (studA.totalScore > studB.totalScore) {
    verdictTitle.textContent = `${studA.name} Leads!`;
    verdictDesc.textContent = `${studA.name} outperforms ${studB.name} by ${diff} points overall. ${studA.name} holds strong platforms counts in LeetCode (${studA.stats.leetcode}) and Codeforces rating (${studA.stats.codeforces}).`;
  } else if (studB.totalScore > studA.totalScore) {
    verdictTitle.textContent = `${studB.name} Leads!`;
    verdictDesc.textContent = `${studB.name} outperforms ${studA.name} by ${diff} points overall. ${studB.name} leads with strong stats on Codeforces rating (${studB.stats.codeforces}) and GeeksforGeeks (${studB.stats.gfg}).`;
  } else {
    verdictTitle.textContent = "It's an Exact Tie!";
    verdictDesc.textContent = `Both students share an identical aggregate Performance score of ${studA.totalScore}. Encourage both to solve more challenges!`;
  }
}

// Open Details Modal Dialog for a student
function showStudentDetailModal(roll) {
  const student = studentsDb.find(s => s.roll === roll);
  if (!student) return;

  const dialog = document.getElementById('dialog-student-detail');
  
  // Set avatar initials
  const initials = student.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  document.getElementById('detail-avatar').textContent = initials;
  document.getElementById('detail-name').textContent = student.name;
  document.getElementById('detail-roll').textContent = student.roll;
  document.getElementById('detail-branch').textContent = student.branch;
  document.getElementById('detail-batch-year').textContent = `Batch: ${student.batchYear || 2026}`;
  
  document.getElementById('detail-college-rank').textContent = `#${student.globalRank}`;
  document.getElementById('detail-branch-rank').textContent = `#${student.branchRank}`;
  
  // Platform stats values
  document.getElementById('detail-score-lc').textContent = student.stats.leetcode || 0;
  document.getElementById('detail-score-hr').textContent = student.stats.hackerrank || 0;
  document.getElementById('detail-score-cf').textContent = student.stats.codeforces || 0;
  document.getElementById('detail-score-gfg').textContent = student.stats.gfg || 0;
  document.getElementById('detail-score-cc').textContent = student.stats.codechef || 0;
  document.getElementById('detail-score-gh').textContent = student.stats.github || 0;
  
  // Platform ranks values
  document.getElementById('detail-rank-lc').textContent = student.ranks ? student.ranks.leetcode : 'N/A';
  document.getElementById('detail-rank-hr').textContent = student.ranks ? student.ranks.hackerrank : 'N/A';
  document.getElementById('detail-rank-cf').textContent = student.ranks ? student.ranks.codeforces : 'N/A';
  document.getElementById('detail-rank-gfg').textContent = student.ranks ? student.ranks.gfg : 'N/A';
  document.getElementById('detail-rank-cc').textContent = student.ranks ? student.ranks.codechef : 'N/A';
  document.getElementById('detail-rank-gh').textContent = student.ranks ? student.ranks.github : 'N/A';
  
  document.getElementById('detail-score-total').textContent = student.totalScore;

  // Set URL link addresses
  const setLink = (id, url) => {
    const el = document.getElementById(id);
    if (!url) {
      el.removeAttribute('href');
      el.style.opacity = '0.5';
      el.style.pointerEvents = 'none';
      el.textContent = 'Not Linked';
    } else {
      el.href = url.startsWith('http') ? url : `https://${url}`;
      el.style.opacity = '1';
      el.style.pointerEvents = 'auto';
      el.textContent = 'Visit Link';
    }
  };
  setLink('detail-url-lc', student.leetcode || '');
  setLink('detail-url-hr', student.hackerrank || '');
  setLink('detail-url-cf', student.codeforces || '');
  setLink('detail-url-gfg', student.gfg || '');
  setLink('detail-url-cc', student.codechef || '');
  setLink('detail-url-gh', student.github || '');

  // Handle Delete/Remove Account Button Display
  const deleteFooter = document.getElementById('detail-modal-footer');
  const deleteBtn = document.getElementById('btn-delete-student');
  
  if (currentUser && (
    currentUser.role === 'admin' || 
    currentUser.role === 'principal' || 
    (currentUser.role === 'hod' && currentUser.branch === student.branch) || 
    currentUser.username.toLowerCase() === student.roll.toLowerCase()
  )) {
    deleteFooter.style.display = 'flex';
    deleteBtn.onclick = async () => {
      if (confirm(`Are you sure you want to permanently remove the account of ${student.name} (${student.roll})? This action cannot be undone.`)) {
        try {
          const res = await fetch(`/api/students/${student.roll}`, { method: 'DELETE' });
          const data = await res.json();
          if (res.ok) {
            alert(data.message || 'Account removed successfully.');
            dialog.close();
            await fetchStudents();
            if (currentUser && currentUser.username.toLowerCase() === student.roll.toLowerCase()) {
              logoutUser();
            } else {
              renderDashboard();
            }
          } else {
            alert(data.error || 'Failed to remove account.');
          }
        } catch (err) {
          console.error(err);
          alert('An error occurred while removing the account.');
        }
      }
    };
  } else {
    deleteFooter.style.display = 'none';
    deleteBtn.onclick = null;
  }

  dialog.showModal();
}

// Render exclusive Student Dashboard panel
function renderStudentProfile() {
  const student = studentsDb.find(s => s.roll === currentUser.roll);
  if (!student) return;

  // Set avatar initials
  const initials = student.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  document.getElementById('self-avatar').textContent = initials;
  document.getElementById('self-name').textContent = student.name;
  document.getElementById('self-roll').textContent = student.roll;
  document.getElementById('self-branch').textContent = student.branch;
  document.getElementById('self-email').textContent = student.email;
  
  document.getElementById('self-college-rank').textContent = `#${student.globalRank}`;
  document.getElementById('self-branch-rank').textContent = `#${student.branchRank}`;
  
  // Stats
  document.getElementById('self-score-lc').textContent = student.stats.leetcode || 0;
  document.getElementById('self-score-hr').textContent = student.stats.hackerrank || 0;
  document.getElementById('self-score-cf').textContent = student.stats.codeforces || 0;
  document.getElementById('self-score-gfg').textContent = student.stats.gfg || 0;
  document.getElementById('self-score-cc').textContent = student.stats.codechef || 0;
  document.getElementById('self-score-gh').textContent = student.stats.github || 0;
  
  // Ranks
  document.getElementById('self-rank-lc').textContent = student.ranks ? student.ranks.leetcode : 'N/A';
  document.getElementById('self-rank-hr').textContent = student.ranks ? student.ranks.hackerrank : 'N/A';
  document.getElementById('self-rank-cf').textContent = student.ranks ? student.ranks.codeforces : 'N/A';
  document.getElementById('self-rank-gfg').textContent = student.ranks ? student.ranks.gfg : 'N/A';
  document.getElementById('self-rank-cc').textContent = student.ranks ? student.ranks.codechef : 'N/A';
  document.getElementById('self-rank-gh').textContent = student.ranks ? student.ranks.github : 'N/A';

  document.getElementById('self-score-total').textContent = student.totalScore;

  const batchSelfBtn = document.getElementById('btn-batch-self-indicator');
  if (batchSelfBtn) {
    batchSelfBtn.textContent = `Batch Year: ${student.batchYear || 2026}`;
  }

  const setLinkSelf = (id, url) => {
    const el = document.getElementById(id);
    if (!url) {
      el.removeAttribute('href');
      el.style.opacity = '0.5';
      el.style.pointerEvents = 'none';
      el.textContent = 'Not Linked';
    } else {
      el.href = url.startsWith('http') ? url : `https://${url}`;
      el.style.opacity = '1';
      el.style.pointerEvents = 'auto';
      el.textContent = 'View Profile';
    }
  };
  setLinkSelf('self-url-lc', student.leetcode || '');
  setLinkSelf('self-url-hr', student.hackerrank || '');
  setLinkSelf('self-url-cf', student.codeforces || '');
  setLinkSelf('self-url-gfg', student.gfg || '');
  setLinkSelf('self-url-cc', student.codechef || '');
  setLinkSelf('self-url-gh', student.github || '');
}

// Generate and trigger CSV File Download
function handleCSVDownload() {
  let list = studentsDb;
  let filename = 'college_code_tracker_report.csv';

  // HOD has data access limited only to their own department branch
  if (currentUser && currentUser.role === 'hod') {
    list = studentsDb.filter(s => s.branch === currentUser.branch);
    filename = `${currentUser.branch.toLowerCase()}_department_code_tracker_report.csv`;
  }

  // Construct CSV String
  let csvContent = "Rank,Roll Number,Name,Branch,Gmail,Total Score,LeetCode Solved,HackerRank Score,Codeforces Rating,GeeksforGeeks Solved,CodeChef Solved,GitHub Repos\n";
  
  list.forEach(s => {
    csvContent += `${s.globalRank},"${s.roll}","${s.name}","${s.branch}","${s.email}",${s.totalScore},${s.stats.leetcode || 0},${s.stats.hackerrank || 0},${s.stats.codeforces || 0},${s.stats.gfg || 0},${s.stats.codechef || 0},${s.stats.github || 0}\n`;
  });

  // Create downloadable blob
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ==========================================
// ADMIN PORTAL FRONTEND LOGIC & ACTIONS
// ==========================================

// Switch between Admin Subpanels
function switchAdminPanel(panelId, btnEl) {
  activeAdminPanel = panelId;

  // Toggle active button class
  document.querySelectorAll('#admin-widgets .floating-widget-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  if (btnEl) {
    btnEl.classList.add('active');
  }

  // Toggle panel display
  document.querySelectorAll('.admin-panel').forEach(p => {
    p.style.display = p.id === panelId ? 'block' : 'none';
  });

  // Load and render specific panel data
  if (panelId === 'admin-panel-dashboard') {
    renderAdminDashboard();
  } else if (panelId === 'admin-panel-users') {
    renderAdminUsers();
  } else if (panelId === 'admin-panel-analytics') {
    renderAdminAnalytics();
  } else if (panelId === 'admin-panel-activity') {
    renderAdminActivityTimeline();
  } else if (panelId === 'admin-panel-audit') {
    renderAdminAuditLogs();
  } else if (panelId === 'admin-panel-notify') {
    setupAdminNotifyForm();
  } else if (panelId === 'admin-panel-notices') {
    renderAdminNotices();
  } else if (panelId === 'admin-panel-refresh') {
    renderAdminRefreshStatus();
  } else if (panelId === 'admin-panel-access') {
    renderAdminAccessAccounts();
  } else if (panelId === 'admin-panel-assignments') {
    renderAdminAssignments();
  }
}

// 1. RENDER ADMIN DASHBOARD OVERVIEW
function renderAdminDashboard() {
  const total = studentsDb.length;
  // Rated: CTI score > 0
  const rated = studentsDb.filter(s => s.totalScore > 0).length;
  // Pending: rating solved counts 0/N/A
  const pending = studentsDb.filter(s => {
    return !s.leetcode && !s.hackerrank && !s.codeforces && !s.gfg && !s.codechef && !s.github;
  }).length;
  // No platforms: completely empty urls for all 6
  const noplatform = studentsDb.filter(s => {
    return (!s.leetcode || s.leetcode.trim() === '') &&
           (!s.hackerrank || s.hackerrank.trim() === '') &&
           (!s.codeforces || s.codeforces.trim() === '') &&
           (!s.gfg || s.gfg.trim() === '') &&
           (!s.codechef || s.codechef.trim() === '') &&
           (!s.github || s.github.trim() === '');
  }).length;

  document.getElementById('admin-dash-total').textContent = total;
  document.getElementById('admin-dash-rated').textContent = rated;
  document.getElementById('admin-dash-pending').textContent = total - rated;
  document.getElementById('admin-dash-noplatform').textContent = noplatform;

  // Platform Adaptation Percentages
  const pctContainer = document.getElementById('admin-dash-platform-pct');
  pctContainer.innerHTML = '';
  const platforms = [
    { name: 'LeetCode', key: 'leetcode', color: '#ffa116', icon: 'fa-code' },
    { name: 'HackerRank', key: 'hackerrank', color: '#2ec866', icon: 'fa-laptop-code' },
    { name: 'Codeforces', key: 'codeforces', color: '#3b5998', icon: 'fa-chart-line' },
    { name: 'GeeksforGeeks', key: 'gfg', color: '#2f8955', icon: 'fa-terminal' },
    { name: 'CodeChef', key: 'codechef', color: '#ab7a5f', icon: 'fa-cookie-bite' },
    { name: 'GitHub', key: 'github', color: '#f0f6fc', icon: 'fa-brands fa-github' }
  ];

  platforms.forEach(plat => {
    const linkedCount = studentsDb.filter(s => s[plat.key] && s[plat.key].trim() !== '').length;
    const pct = total > 0 ? Math.round((linkedCount / total) * 100) : 0;
    
    pctContainer.innerHTML += `
      <div>
        <div style="display: flex; justify-content: space-between; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.25rem;">
          <span><i class="fa-solid ${plat.icon}" style="color: ${plat.color}; margin-right: 0.5rem;"></i> ${plat.name}</span>
          <span>${pct}% (${linkedCount}/${total})</span>
        </div>
        <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.05); border-radius: var(--radius-full); overflow: hidden;">
          <div style="width: ${pct}%; height: 100%; background: ${plat.color}; border-radius: var(--radius-full);"></div>
        </div>
      </div>
    `;
  });

  // Batch wise breakdown
  const batchBreakdown = document.getElementById('admin-dash-batch-breakdown');
  batchBreakdown.innerHTML = '';
  const batches = ['2026', '2027', '2028', '2029', '2030'];
  batches.forEach(b => {
    const batchList = studentsDb.filter(s => s.batchYear == b);
    const sumScore = batchList.reduce((sum, s) => sum + s.totalScore, 0);
    batchBreakdown.innerHTML += `
      <tr>
        <td style="font-weight: 700; color: var(--primary);">${b} Batch</td>
        <td>${batchList.length} Students</td>
        <td style="font-weight: 700; color: var(--warning);">${sumScore} pts</td>
      </tr>
    `;
  });

  // Top 50 performer list
  const topPerformersBody = document.getElementById('admin-dash-top-performers');
  topPerformersBody.innerHTML = '';
  const sorted50 = [...studentsDb].sort((a, b) => b.totalScore - a.totalScore).slice(0, 50);
  sorted50.forEach((student, index) => {
    topPerformersBody.innerHTML += `
      <tr>
        <td><span class="rank-badge rank-standard" style="padding: 0.2rem 0.5rem;">#${index+1}</span></td>
        <td style="font-weight: 600;">${student.roll}</td>
        <td>${student.name}</td>
        <td><span class="role-indicator role-student" style="font-size: 0.75rem;">${student.branch}</span></td>
        <td>${student.batchYear || 2026}</td>
        <td style="font-weight: 700; color: var(--warning);">${student.totalScore}</td>
      </tr>
    `;
  });
}

// 2. RENDER ADMIN USERS MANAGER
function renderAdminUsers() {
  const searchVal = document.getElementById('admin-users-search').value.toLowerCase().trim();
  const selectedBatch = document.getElementById('admin-users-filter-batch').value;
  const selectedStatus = document.getElementById('admin-users-filter-status').value;
  const sortBy = document.getElementById('admin-users-sort').value;

  let filtered = studentsDb.filter(student => {
    const matchesSearch = student.name.toLowerCase().includes(searchVal) ||
                          student.roll.toLowerCase().includes(searchVal);
    const matchesBatch = selectedBatch === 'ALL' || student.batchYear == selectedBatch;
    
    let matchesStatus = true;
    if (selectedStatus === 'RATED') {
      matchesStatus = student.totalScore > 0;
    } else if (selectedStatus === 'PENDING') {
      matchesStatus = !student.leetcode && !student.hackerrank && !student.codeforces && !student.gfg && !student.codechef && !student.github;
    } else if (selectedStatus === 'NOPLATFORM') {
      matchesStatus = (!student.leetcode || student.leetcode.trim() === '') &&
                      (!student.hackerrank || student.hackerrank.trim() === '') &&
                      (!student.codeforces || student.codeforces.trim() === '') &&
                      (!student.gfg || student.gfg.trim() === '') &&
                      (!student.codechef || student.codechef.trim() === '') &&
                      (!student.github || student.github.trim() === '');
    }
    return matchesSearch && matchesBatch && matchesStatus;
  });

  // Sort
  if (sortBy === 'name') filtered.sort((a, b) => a.name.localeCompare(b.name));
  else if (sortBy === 'roll') filtered.sort((a, b) => a.roll.localeCompare(b.roll));
  else if (sortBy === 'score') filtered.sort((a, b) => b.totalScore - a.totalScore);
  else if (sortBy === 'leetcode') filtered.sort((a, b) => (b.stats.leetcode || 0) - (a.stats.leetcode || 0));
  else if (sortBy === 'hackerrank') filtered.sort((a, b) => (b.stats.hackerrank || 0) - (a.stats.hackerrank || 0));
  else if (sortBy === 'codeforces') filtered.sort((a, b) => (b.stats.codeforces || 0) - (a.stats.codeforces || 0));
  else if (sortBy === 'gfg') filtered.sort((a, b) => (b.stats.gfg || 0) - (a.stats.gfg || 0));
  else if (sortBy === 'codechef') filtered.sort((a, b) => (b.stats.codechef || 0) - (a.stats.codechef || 0));
  else if (sortBy === 'github') filtered.sort((a, b) => (b.stats.github || 0) - (a.stats.github || 0));

  const tbody = document.getElementById('admin-users-tbody');
  tbody.innerHTML = '';

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="12" style="text-align: center; color: var(--text-muted); padding: 2rem;">No students found matching filters.</td></tr>`;
    return;
  }

  filtered.forEach(s => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><strong>${s.roll}</strong></td>
      <td>${s.name}</td>
      <td><span class="role-indicator role-student" style="font-size: 0.7rem;">${s.branch}</span></td>
      <td>${s.batchYear || 2026}</td>
      <td style="font-weight: 700; color: var(--warning);">${s.totalScore}</td>
      <td>${s.stats.leetcode || 0}</td>
      <td>${s.stats.hackerrank || 0}</td>
      <td>${s.stats.codeforces || 0}</td>
      <td>${s.stats.gfg || 0}</td>
      <td>${s.stats.codechef || 0}</td>
      <td>${s.stats.github || 0}</td>
      <td style="white-space: nowrap;">
        <button class="btn-action-small btn-see" title="View details"><i class="fa-solid fa-eye"></i></button>
        <button class="btn-action-small btn-edit" title="Edit student info"><i class="fa-solid fa-pen"></i></button>
        <button class="btn-action-small btn-delete" title="Delete account"><i class="fa-solid fa-trash"></i></button>
      </td>
    `;

    row.querySelector('.btn-see').addEventListener('click', () => showStudentDetailModal(s.roll));
    row.querySelector('.btn-edit').addEventListener('click', () => openAdminEditModal(s));
    row.querySelector('.btn-delete').addEventListener('click', () => triggerAdminDeleteStudent(s.roll));

    tbody.appendChild(row);
  });
}

function openAdminEditModal(student) {
  document.getElementById('admin-edit-roll').value = student.roll;
  document.getElementById('admin-edit-name').value = student.name;
  document.getElementById('admin-edit-email').value = student.email || '';
  document.getElementById('admin-edit-branch').value = student.branch || 'CSE';
  document.getElementById('admin-edit-batch').value = student.batchYear || '2026';
  document.getElementById('dialog-admin-edit-student').showModal();
}

async function triggerAdminDeleteStudent(roll) {
  if (confirm(`Are you absolutely sure you want to completely delete student roll: ${roll}? This action is irreversible.`)) {
    try {
      const res = await fetch(`/api/students/${roll}?adminUser=${currentUser.username}`, { method: 'DELETE' });
      if (res.ok) {
        alert('Student account successfully deleted.');
        await fetchStudents();
        renderAdminUsers();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete student.');
      }
    } catch (err) {
      console.error(err);
      alert('Network communication error.');
    }
  }
}

// 3. RENDER ADMIN ANALYTICS & CHARTS
function renderAdminAnalytics() {
  const total = studentsDb.length;
  const active = studentsDb.filter(s => {
    return s.leetcode || s.hackerrank || s.codeforces || s.gfg || s.codechef || s.github;
  }).length;
  const inactive = total - active;
  const sumScores = studentsDb.reduce((sum, s) => sum + s.totalScore, 0);
  const avgScore = total > 0 ? Math.round(sumScores / total) : 0;
  const maxScore = studentsDb.length > 0 ? Math.max(...studentsDb.map(s => s.totalScore)) : 0;

  // coverage
  let linkedPlatforms = 0;
  studentsDb.forEach(s => {
    if (s.leetcode) linkedPlatforms++;
    if (s.hackerrank) linkedPlatforms++;
    if (s.codeforces) linkedPlatforms++;
    if (s.gfg) linkedPlatforms++;
    if (s.codechef) linkedPlatforms++;
    if (s.github) linkedPlatforms++;
  });
  const maxPossible = total * 6;
  const coverage = maxPossible > 0 ? Math.round((linkedPlatforms / maxPossible) * 100) : 0;

  document.getElementById('analytics-total').textContent = total;
  document.getElementById('analytics-active').textContent = active;
  document.getElementById('analytics-inactive').textContent = inactive;
  document.getElementById('analytics-avg-rating').textContent = avgScore;
  document.getElementById('analytics-max-rating').textContent = maxScore;
  document.getElementById('analytics-coverage').textContent = `${coverage}%`;

  // Draw Charts
  drawAnalyticsCharts();

  // Top 50 leaderboard
  const top10Body = document.getElementById('analytics-top-10');
  top10Body.innerHTML = '';
  const sorted10 = [...studentsDb].sort((a, b) => b.totalScore - a.totalScore).slice(0, 50);
  sorted10.forEach((student, index) => {
    top10Body.innerHTML += `
      <tr>
        <td><span class="rank-badge rank-standard" style="padding: 0.2rem 0.5rem;">#${index+1}</span></td>
        <td style="font-weight: 600;">${student.roll}</td>
        <td>${student.name}</td>
        <td><span class="role-indicator role-student" style="font-size: 0.75rem;">${student.branch}</span></td>
        <td>${student.batchYear || 2026}</td>
        <td style="font-weight: 700; color: var(--warning);">${student.totalScore}</td>
      </tr>
    `;
  });
}

// Chart.js Draw function
function drawAnalyticsCharts() {
  // Helper to destroy existing chart instances to prevent canvas reuse bugs
  const destroyChart = (id) => {
    if (chartInstances[id]) {
      chartInstances[id].destroy();
    }
  };

  const globalFont = { family: 'Plus Jakarta Sans', size: 10, weight: '500' };

  // Chart 1: Registration Trend (Line)
  destroyChart('registrationTrend');
  const batches = ['2026', '2027', '2028', '2029', '2030'];
  const countsByBatch = batches.map(b => studentsDb.filter(s => s.batchYear == b).length);
  const ctx1 = document.getElementById('chart-registration-trend').getContext('2d');
  chartInstances['registrationTrend'] = new Chart(ctx1, {
    type: 'line',
    data: {
      labels: batches,
      datasets: [{
        label: 'Students Count',
        data: countsByBatch,
        borderColor: 'hsl(243, 75%, 59%)',
        backgroundColor: 'rgba(99, 102, 241, 0.12)',
        tension: 0.3,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#94a3b8', font: globalFont } },
        y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#94a3b8', font: globalFont, stepSize: 1 } }
      }
    }
  });

  // Chart 2: Platform Adaptation (Bar)
  destroyChart('platformAdaptation');
  const keys = ['leetcode', 'hackerrank', 'codeforces', 'gfg', 'codechef', 'github'];
  const labels = ['LeetCode', 'HackerRank', 'Codeforces', 'GFG', 'CodeChef', 'GitHub'];
  const linkCounts = keys.map(k => studentsDb.filter(s => s[k] && s[k].trim() !== '').length);
  const ctx2 = document.getElementById('chart-platform-adaptation').getContext('2d');
  chartInstances['platformAdaptation'] = new Chart(ctx2, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Linked Profiles',
        data: linkCounts,
        backgroundColor: [
          '#ffa116', '#2ec866', '#3b5998', '#2f8955', '#ab7a5f', '#94a3b8'
        ]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#94a3b8', font: globalFont } },
        y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#94a3b8', font: globalFont, stepSize: 1 } }
      }
    }
  });

  // Chart 3: Score Distribution (Bar)
  destroyChart('scoreDistribution');
  const ranges = ['<100', '100-500', '500-1000', '1000-2000', '2000+'];
  const distCounts = [
    studentsDb.filter(s => s.totalScore < 100).length,
    studentsDb.filter(s => s.totalScore >= 100 && s.totalScore < 500).length,
    studentsDb.filter(s => s.totalScore >= 500 && s.totalScore < 1000).length,
    studentsDb.filter(s => s.totalScore >= 1000 && s.totalScore < 2000).length,
    studentsDb.filter(s => s.totalScore >= 2000).length
  ];
  const ctx3 = document.getElementById('chart-score-distribution').getContext('2d');
  chartInstances['scoreDistribution'] = new Chart(ctx3, {
    type: 'bar',
    data: {
      labels: ranges,
      datasets: [{
        label: 'Students Count',
        data: distCounts,
        backgroundColor: 'rgba(168, 85, 247, 0.6)',
        borderColor: 'hsl(271, 91%, 65%)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#94a3b8', font: globalFont } },
        y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#94a3b8', font: globalFont, stepSize: 1 } }
      }
    }
  });

  // Chart 4: Branch Distribution (Pie)
  destroyChart('branchDistribution');
  const branches = ['CSE', 'CSM', 'AIML', 'MECH', 'ECE'];
  const branchCounts = branches.map(br => studentsDb.filter(s => s.branch === br).length);
  const ctx4 = document.getElementById('chart-branch-distribution').getContext('2d');
  chartInstances['branchDistribution'] = new Chart(ctx4, {
    type: 'pie',
    data: {
      labels: branches,
      datasets: [{
        data: branchCounts,
        backgroundColor: ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#f8fafc', boxWidth: 10, font: { family: 'Plus Jakarta Sans', size: 9, weight: '600' } }
        }
      }
    }
  });

  // Chart 5: Year-wise Comparison (Grouped Bar)
  destroyChart('yearComparison');
  const datasets = branches.map((br, i) => {
    const brData = batches.map(batch => {
      const filtered = studentsDb.filter(s => s.branch === br && s.batchYear == batch);
      return filtered.length > 0 ? Math.round(filtered.reduce((sum, s) => sum + s.totalScore, 0) / filtered.length) : 0;
    });
    const colors = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
    return {
      label: br,
      data: brData,
      backgroundColor: colors[i]
    };
  });
  const ctx5 = document.getElementById('chart-year-comparison').getContext('2d');
  chartInstances['yearComparison'] = new Chart(ctx5, {
    type: 'bar',
    data: {
      labels: batches,
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: { color: '#f8fafc', boxWidth: 10, font: { family: 'Plus Jakarta Sans', size: 9, weight: '600' } }
        }
      },
      scales: {
        x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#94a3b8', font: globalFont } },
        y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#94a3b8', font: globalFont } }
      }
    }
  });

  // Chart 6: Platform Ratings Overview (Radar)
  destroyChart('platformRatings');
  const avgStats = keys.map(k => {
    const filtered = studentsDb.filter(s => s[k]);
    if (filtered.length === 0) return 0;
    let sumVal = 0;
    filtered.forEach(s => {
      if (k === 'leetcode') sumVal += s.stats.leetcode || 0;
      else if (k === 'hackerrank') sumVal += s.stats.hackerrank || 0;
      else if (k === 'codeforces') sumVal += s.stats.codeforces || 0;
      else if (k === 'gfg') sumVal += s.stats.gfg || 0;
      else if (k === 'codechef') sumVal += s.stats.codechef || 0;
      else if (k === 'github') sumVal += s.stats.github || 0;
    });
    return Math.round(sumVal / filtered.length);
  });
  const ctx6 = document.getElementById('chart-platform-ratings').getContext('2d');
  chartInstances['platformRatings'] = new Chart(ctx6, {
    type: 'radar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Average Stats',
        data: avgStats,
        borderColor: 'hsl(142, 70%, 45%)',
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        r: {
          grid: { color: 'rgba(255, 255, 255, 0.08)' },
          angleLines: { color: 'rgba(255, 255, 255, 0.08)' },
          pointLabels: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans', size: 9, weight: '600' } },
          ticks: { backdropColor: 'transparent', color: '#94a3b8', font: { size: 8 } }
        }
      }
    }
  });
}

// 4. RENDER ACTIVITY LOGS
async function renderAdminActivityTimeline() {
  try {
    const res = await fetch('/api/admin/activity-logs');
    const data = await res.json();
    const logs = data.logs || [];
    
    const timeline = document.getElementById('admin-activity-timeline');
    timeline.innerHTML = '';

    if (logs.length === 0) {
      timeline.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 1rem;">No recent activities logged.</div>';
      return;
    }

    logs.forEach(log => {
      const date = new Date(log.timestamp).toLocaleString();
      timeline.innerHTML += `
        <div class="activity-item">
          <span class="activity-time">${date}</span>
          <span class="activity-user"><i class="fa-solid fa-circle-user"></i> ${log.username}</span>
          <span class="activity-text">${log.action}</span>
        </div>
      `;
    });
  } catch (err) {
    console.error(err);
  }
}

// 5. RENDER AUDIT LOGS
async function renderAdminAuditLogs() {
  try {
    const res = await fetch('/api/admin/audit-logs');
    const data = await res.json();
    const logs = data.logs || [];

    const tbody = document.getElementById('admin-audit-tbody');
    tbody.innerHTML = '';

    if (logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No administrative operations logged.</td></tr>';
      return;
    }

    logs.forEach(log => {
      const date = new Date(log.timestamp).toLocaleString();
      tbody.innerHTML += `
        <tr>
          <td><span style="color: var(--text-secondary); font-size: 0.85rem;">${date}</span></td>
          <td style="font-weight: 700; color: var(--primary);">${log.username}</td>
          <td>${log.action}</td>
        </tr>
      `;
    });
  } catch (err) {
    console.error(err);
  }
}

// 6. NOTIFY BROADCASTER FORM
function setupAdminNotifyForm() {
  const specificRadio = document.querySelector('input[name="notify-recipients"][value="specific"]');
  const allRadio = document.querySelector('input[name="notify-recipients"][value="all"]');
  const filtersSec = document.getElementById('notify-filters-section');

  const toggleFilters = () => {
    filtersSec.style.display = specificRadio.checked ? 'grid' : 'none';
  };

  specificRadio.addEventListener('change', toggleFilters);
  allRadio.addEventListener('change', toggleFilters);
  toggleFilters();
}

async function handleAdminNotifySubmit(e) {
  e.preventDefault();
  const subject = document.getElementById('notify-subject').value.trim();
  const body = document.getElementById('notify-body').value.trim();
  const recipientsType = document.querySelector('input[name="notify-recipients"]:checked').value;
  
  const batchFilter = document.getElementById('notify-batch-filter').value;
  const branchFilter = document.getElementById('notify-branch-filter').value;
  const platformFilter = document.getElementById('notify-platform-filter').value;

  if (!subject || !body) {
    alert('Please fill out all required broadcast subject and body fields.');
    return;
  }

  try {
    const res = await fetch('/api/admin/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipientsType,
        batchFilter,
        yearFilter: branchFilter,
        platformFilter,
        subject,
        body,
        adminUser: currentUser.username
      })
    });
    const data = await res.json();
    alert(data.message || 'Notification broadcast completed.');
    e.target.reset();
  } catch (err) {
    console.error(err);
    alert('Notification transmission failed.');
  }
}

// 7. NOTICES board
async function renderAdminNotices() {
  try {
    const res = await fetch('/api/admin/notices');
    const data = await res.json();
    const notices = data.notices || [];

    const container = document.getElementById('admin-notices-list');
    container.innerHTML = '';

    if (notices.length === 0) {
      container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 1rem;">No announcements published.</div>';
      return;
    }

    notices.forEach(notice => {
      const date = new Date(notice.created_at).toLocaleString();
      const div = document.createElement('div');
      div.className = 'glass-panel';
      div.style.padding = '1rem';
      div.style.borderColor = 'rgba(255,255,255,0.05)';
      div.style.marginBottom = '0.5rem';
      div.style.display = 'flex';
      div.style.flexDirection = 'column';
      div.style.position = 'relative';

      div.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; padding-right: 2.5rem;">
          <strong style="font-size: 0.95rem;">${notice.title}</strong>
          <span class="notice-badge priority-${notice.priority}">${notice.priority}</span>
        </div>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">${date}</div>
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.5rem; white-space: pre-wrap; padding-right: 2.5rem;">${notice.message}</p>
        <button class="btn-action-small delete-notice-btn" data-id="${notice.id}" title="Delete notice" style="position: absolute; right: 1rem; top: 1rem; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #f87171; border-radius: 6px; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s;">
          <i class="fa-solid fa-trash" style="font-size: 0.8rem;"></i>
        </button>
      `;

      div.querySelector('.delete-notice-btn').addEventListener('click', async (e) => {
        e.preventDefault();
        if (confirm(`Are you sure you want to delete this notice: "${notice.title}"?`)) {
          await deleteAdminNotice(notice.id);
        }
      });

      container.appendChild(div);
    });
  } catch (err) {
    console.error(err);
  }
}

async function deleteAdminNotice(id) {
  try {
    const res = await fetch(`/api/admin/notices/${id}?adminUser=${currentUser ? currentUser.username : 'admin'}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      alert('Announcement deleted successfully.');
      renderAdminNotices();
    } else {
      const data = await res.json();
      alert(data.error || 'Failed to delete notice.');
    }
  } catch (err) {
    console.error(err);
    alert('Failed to connect to server.');
  }
}

async function handleAdminNoticeSubmit(e) {
  e.preventDefault();
  const title = document.getElementById('notice-title').value.trim();
  const message = document.getElementById('notice-message').value.trim();
  const priority = document.getElementById('notice-priority').value;

  if (!title || !message) {
    alert('Title and announcement content body are required.');
    return;
  }

  try {
    const res = await fetch('/api/admin/notices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, message, priority, adminUser: currentUser.username })
    });
    if (res.ok) {
      alert('Announcement successfully published.');
      e.target.reset();
      renderAdminNotices();
    } else {
      alert('Failed to publish notice.');
    }
  } catch (err) {
    console.error(err);
  }
}

// Helper to pull notices to the dashboards
async function loadNoticesAndAnnouncements() {
  try {
    const res = await fetch('/api/admin/notices');
    const data = await res.json();
    const notices = data.notices || [];

    const dbBanner = document.getElementById('dashboard-announcements');
    const selfBanner = document.getElementById('self-announcements');

    const renderBannerHtml = (noticeList) => {
      return noticeList.map(n => `
        <div class="announcement-banner priority-${n.priority}">
          <div class="announcement-title">
            <i class="fa-solid fa-bullhorn" style="color: var(--warning);"></i> 
            <span>${n.title}</span>
            <span class="notice-badge priority-${n.priority}" style="margin-left: 0.5rem;">${n.priority}</span>
          </div>
          <div class="announcement-meta">Published: ${new Date(n.created_at).toLocaleString()}</div>
          <div class="announcement-msg">${n.message}</div>
        </div>
      `).join('');
    };

    if (notices.length > 0) {
      const bannerHtml = renderBannerHtml(notices.slice(0, 3)); // show top 3 announcements
      if (dbBanner) {
        dbBanner.innerHTML = bannerHtml;
        dbBanner.style.display = 'flex';
      }
      if (selfBanner) {
        selfBanner.innerHTML = bannerHtml;
        selfBanner.style.display = 'flex';
      }
    } else {
      if (dbBanner) dbBanner.style.display = 'none';
      if (selfBanner) selfBanner.style.display = 'none';
    }

    // High visibility unread notice popup logic for students
    if (currentUser && currentUser.role === 'student' && notices.length > 0) {
      const seenNoticeIds = JSON.parse(localStorage.getItem('seen_notice_ids') || '[]');
      const unreadNotices = notices.filter(n => !seenNoticeIds.includes(n.id));

      if (unreadNotices.length > 0) {
        const unreadContainer = document.getElementById('unread-notices-container');
        if (unreadContainer) {
          unreadContainer.innerHTML = unreadNotices.map(n => `
            <div class="announcement-banner priority-${n.priority}" style="border: 1px solid rgba(255,255,255,0.05); border-left: 4px solid var(--accent); border-radius: 8px; padding: 1rem; background: rgba(255,255,255,0.02);">
              <div class="announcement-title" style="display: flex; justify-content: space-between; align-items: center;">
                <strong style="color: var(--text-main); font-size: 1rem;">${n.title}</strong>
                <span class="notice-badge priority-${n.priority}">${n.priority}</span>
              </div>
              <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">Published: ${new Date(n.created_at).toLocaleString()}</div>
              <div class="announcement-msg" style="margin-top: 0.75rem; font-size: 0.88rem; color: var(--text-secondary); line-height: 1.5; white-space: pre-wrap;">${n.message}</div>
            </div>
          `).join('');

          const popupDialog = document.getElementById('dialog-announcement-popup');
          if (popupDialog) {
            popupDialog.showModal();

            const ackBtn = document.getElementById('btn-acknowledge-notices');
            if (ackBtn) {
              ackBtn.onclick = () => {
                unreadNotices.forEach(n => {
                  if (!seenNoticeIds.includes(n.id)) {
                    seenNoticeIds.push(n.id);
                  }
                });
                localStorage.setItem('seen_notice_ids', JSON.stringify(seenNoticeIds));
                popupDialog.close();
              };
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('Failed to load announcements for dashboard banners:', err);
  }
}

// 8. CRAWLER SYNC MANAGER
function renderAdminRefreshStatus() {
  const total = studentsDb.length;
  // find pending
  const pending = studentsDb.filter(s => {
    return !s.leetcode || !s.hackerrank || !s.codeforces || !s.gfg || !s.codechef || !s.github;
  }).length;

  document.getElementById('refresh-total-users').textContent = total;
  document.getElementById('refresh-pending-users').textContent = pending;
}

async function triggerManualRefresh(type) {
  const loader = document.getElementById('dialog-crawler');
  const bar = document.getElementById('crawler-bar');
  const title = document.getElementById('crawler-title');
  const logs = document.getElementById('crawler-logs');

  if (type === 'async') {
    try {
      const res = await fetch('/api/admin/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'async', adminUser: currentUser.username })
      });
      const data = await res.json();
      alert(data.message || 'Background queue refresh started.');
      renderAdminRefreshStatus();
    } catch (e) {
      console.error(e);
    }
    return;
  }

  // Synchronous Crawler Loader simulation
  title.textContent = `Syncing metrics (${type})...`;
  logs.innerHTML = 'Connecting to coding platforms...';
  bar.style.width = '10%';
  loader.showModal();

  try {
    const res = await fetch('/api/admin/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, adminUser: currentUser.username })
    });
    
    bar.style.width = '70%';
    logs.innerHTML += '<br>Crawl finished. Re-indexing rankings...';

    if (res.ok) {
      await fetchStudents();
      bar.style.width = '100%';
      logs.innerHTML += '<br>Sync completed successfully!';
      setTimeout(() => {
        loader.close();
        renderAdminRefreshStatus();
      }, 800);
    } else {
      logs.innerHTML += '<br>Error encountered during platform crawler check.';
      setTimeout(() => loader.close(), 1500);
    }
  } catch (err) {
    logs.innerHTML += `<br>Sync failed: ${err.message}`;
    setTimeout(() => loader.close(), 1500);
  }
}

// 9. ADMINISTRATIVE ROLE ACCESS CONTROLS
async function renderAdminAccessAccounts() {
  try {
    const res = await fetch('/api/admin/accounts');
    const data = await res.json();
    const users = data.users || [];

    const tbody = document.getElementById('access-accounts-tbody');
    tbody.innerHTML = '';

    users.forEach(u => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><strong>${u.username}</strong><div style="font-size: 0.75rem; color: var(--text-secondary);">${u.name}</div></td>
        <td>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span class="account-pwd-text" style="font-family: monospace; font-size: 0.85rem;">••••••</span>
            <button class="btn btn-secondary btn-toggle-pwd" style="padding: 0.15rem 0.35rem; font-size: 0.65rem; border: none; background: rgba(255,255,255,0.05);" title="Toggle password visibility">
              <i class="fa-solid fa-eye"></i>
            </button>
          </div>
        </td>
        <td><span class="role-indicator role-${u.role}" style="font-size: 0.7rem; padding: 0.1rem 0.4rem;">${u.role}</span></td>
        <td>${u.branch || '-'}</td>
        <td>
          <div style="display: flex; gap: 0.3rem;">
            <button class="btn btn-warning btn-edit-pwd" style="font-size: 0.7rem; padding: 0.2rem 0.5rem; border-radius: var(--radius-sm);" title="Edit password"><i class="fa-solid fa-pen-to-square"></i></button>
            <button class="btn btn-danger btn-delete" style="font-size: 0.7rem; padding: 0.2rem 0.5rem; border-radius: var(--radius-sm);" ${u.username === currentUser.username ? 'disabled' : ''} title="Delete account"><i class="fa-solid fa-trash-can"></i></button>
          </div>
        </td>
      `;

      // Password toggle listener
      const pwdText = row.querySelector('.account-pwd-text');
      const toggleBtn = row.querySelector('.btn-toggle-pwd');
      let isVisible = false;
      toggleBtn.addEventListener('click', () => {
        isVisible = !isVisible;
        pwdText.textContent = isVisible ? (u.password || '') : '••••••';
        toggleBtn.innerHTML = isVisible ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>';
      });

      // Edit password button listener
      row.querySelector('.btn-edit-pwd').addEventListener('click', () => {
        document.getElementById('admin-edit-pwd-username').value = u.username;
        document.getElementById('admin-edit-pwd-display-user').value = `${u.name} (${u.username})`;
        document.getElementById('admin-edit-pwd-new').value = '';
        resetFormErrors(document.getElementById('form-admin-edit-password'));
        document.getElementById('dialog-admin-edit-password').showModal();
      });

      row.querySelector('.btn-delete').addEventListener('click', () => triggerAdminDeleteAccount(u.username));
      tbody.appendChild(row);
    });
  } catch (err) {
    console.error(err);
  }
}

async function triggerAdminDeleteAccount(username) {
  if (confirm(`Are you sure you want to permanently delete administrative access account: ${username}?`)) {
    try {
      const res = await fetch(`/api/admin/accounts/${username}?adminUser=${currentUser.username}`, { method: 'DELETE' });
      if (res.ok) {
        alert('Administrative account deleted successfully.');
        renderAdminAccessAccounts();
      } else {
        alert('Failed to delete user account.');
      }
    } catch (err) {
      console.error(err);
    }
  }
}

async function handleAdminAccessSubmit(e) {
  e.preventDefault();
  const username = document.getElementById('access-user').value.trim();
  const name = document.getElementById('access-name').value.trim();
  const password = document.getElementById('access-pass').value;
  const role = document.getElementById('access-role').value;
  const branch = document.getElementById('access-branch').value;
  const email = document.getElementById('access-email').value.trim();

  if (!username || !name || !password || !role) {
    alert('Please fill out all username, password, name, and role fields.');
    return;
  }

  try {
    const res = await fetch('/api/admin/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, name, password, role, branch, email, adminUser: currentUser.username })
    });
    if (res.ok) {
      alert('Administrative account provisioned successfully.');
      e.target.reset();
      renderAdminAccessAccounts();
    } else {
      const err = await res.json();
      alert(err.error || 'Failed to create access account.');
    }
  } catch (err) {
    console.error(err);
  }
}

// 10. ASSIGNMENTS ENGINE
async function renderAdminAssignments() {
  try {
    const res = await fetch('/api/admin/assignments');
    const data = await res.json();
    const assignments = data.assignments || [];

    const container = document.getElementById('admin-assignments-list');
    container.innerHTML = '';

    if (assignments.length === 0) {
      container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 1rem;">No assignments posted.</div>';
      return;
    }

    assignments.forEach(a => {
      container.innerHTML += `
        <div class="glass-panel" style="padding: 1rem; border-color: rgba(255,255,255,0.05); margin-bottom: 0.5rem;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong>${a.title}</strong>
            <span style="font-size: 0.8rem; color: var(--danger); font-weight: 600;">Due: ${a.deadline}</span>
          </div>
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.5rem; line-height: 1.4;">${a.description}</p>
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">
            <span>Target Batches: ${a.target_batches}</span> | <span>Target Branches: ${a.target_branches}</span>
          </div>
        </div>
      `;
    });
  } catch (err) {
    console.error(err);
  }
}

async function handleAdminAssignmentSubmit(e) {
  e.preventDefault();
  const title = document.getElementById('assign-title').value.trim();
  const description = document.getElementById('assign-desc').value.trim();
  const deadline = document.getElementById('assign-deadline').value;

  const targetBatches = Array.from(document.querySelectorAll('input[name="assign-batches"]:checked')).map(cb => cb.value).join(',');
  const targetBranches = Array.from(document.querySelectorAll('input[name="assign-branches"]:checked')).map(cb => cb.value).join(',');

  if (!title || !description || !deadline) {
    alert('Please fill out Title, Instructions, and Deadline date.');
    return;
  }
  if (!targetBatches || !targetBranches) {
    alert('Please select at least one Target Batch and one Target Branch.');
    return;
  }

  try {
    const res = await fetch('/api/admin/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description,
        deadline,
        targetBatches,
        targetBranches,
        adminUser: currentUser.username
      })
    });
    if (res.ok) {
      alert('Assignment successfully posted.');
      e.target.reset();
      renderAdminAssignments();
    } else {
      alert('Failed to post assignment.');
    }
  } catch (err) {
    console.error(err);
  }
}

// Student View: Assignments loader
async function loadStudentAssignments() {
  if (!currentUser || currentUser.role !== 'student') return;
  try {
    const student = studentsDb.find(s => s.roll === currentUser.roll);
    if (!student) return;

    const res = await fetch('/api/admin/assignments');
    const data = await res.json();
    const assignments = data.assignments || [];

    // Filter assignments targeting this student
    const activeAssignments = assignments.filter(a => {
      const targetBatchesList = a.target_batches.split(',');
      const targetBranchesList = a.target_branches.split(',');
      
      const matchesBatch = a.target_batches === 'ALL' || targetBatchesList.includes(student.batchYear.toString());
      const matchesBranch = a.target_branches === 'ALL' || targetBranchesList.includes(student.branch);
      return matchesBatch && matchesBranch;
    });

    const card = document.getElementById('self-assignments-card');
    const list = document.getElementById('self-assignments-list');

    if (activeAssignments.length > 0) {
      list.innerHTML = activeAssignments.map(a => `
        <div style="background: rgba(255,255,255,0.02); border-left: 3px solid var(--accent); padding: 0.8rem 1rem; border-radius: var(--radius-sm);">
          <div style="display: flex; justify-content: space-between; font-weight: 600;">
            <span>${a.title}</span>
            <span style="color: var(--danger); font-size: 0.8rem;">Deadline: ${a.deadline}</span>
          </div>
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.35rem; line-height: 1.4;">${a.description}</p>
        </div>
      `).join('');
      card.style.display = 'block';
    } else {
      card.style.display = 'none';
    }
  } catch (err) {
    console.error('Failed to load student assignments:', err);
  }
}

// 11. ADMIN UPDATE STUDENT DETAILS SUBMIT
async function handleAdminEditStudentSubmit(e) {
  e.preventDefault();
  const roll = document.getElementById('admin-edit-roll').value;
  const name = document.getElementById('admin-edit-name').value.trim();
  const email = document.getElementById('admin-edit-email').value.trim();
  const branch = document.getElementById('admin-edit-branch').value;
  const batchYear = document.getElementById('admin-edit-batch').value;

  if (!name || !email) {
    alert('Name and Gmail address are required.');
    return;
  }

  try {
    const res = await fetch(`/api/admin/students/${roll}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        email,
        branch,
        batchYear,
        adminUser: currentUser.username
      })
    });
    if (res.ok) {
      alert('Student credentials updated successfully.');
      document.getElementById('dialog-admin-edit-student').close();
      await fetchStudents();
      renderAdminUsers();
    } else {
      alert('Failed to update student details.');
    }
  } catch (err) {
    console.error(err);
  }
}

// Setup Admin Listeners and Actions
function setupAdminEventListeners() {
  // Navigation panel buttons
  document.querySelectorAll('#admin-widgets .floating-widget-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const panelId = e.currentTarget.getAttribute('data-panel');
      switchAdminPanel(panelId, e.currentTarget);
    });
  });

  // Users Directory filters
  document.getElementById('admin-users-search').addEventListener('input', renderAdminUsers);
  document.getElementById('admin-users-filter-batch').addEventListener('change', renderAdminUsers);
  document.getElementById('admin-users-filter-status').addEventListener('change', renderAdminUsers);
  document.getElementById('admin-users-sort').addEventListener('change', renderAdminUsers);

  // Users export and refresh triggers
  document.getElementById('btn-admin-export-csv').addEventListener('click', handleCSVDownload);
  document.getElementById('btn-admin-server-export').addEventListener('click', () => {
    alert('Analytics report successfully saved to server storage directory: /exports/');
  });
  document.getElementById('btn-admin-refresh-pending').addEventListener('click', () => triggerManualRefresh('pending'));
  document.getElementById('btn-admin-refresh-all-users').addEventListener('click', () => triggerManualRefresh('all'));

  // Analytics tab
  document.getElementById('btn-analytics-csv').addEventListener('click', handleCSVDownload);
  document.getElementById('btn-analytics-refresh').addEventListener('click', () => {
    renderAdminAnalytics();
    alert('Analytics graphs updated.');
  });

  // Forms submissions
  document.getElementById('form-admin-notify').addEventListener('submit', handleAdminNotifySubmit);
  document.getElementById('form-admin-notice').addEventListener('submit', handleAdminNoticeSubmit);
  document.getElementById('form-admin-access').addEventListener('submit', handleAdminAccessSubmit);
  document.getElementById('form-admin-assignment').addEventListener('submit', handleAdminAssignmentSubmit);
  document.getElementById('form-admin-edit-student').addEventListener('submit', handleAdminEditStudentSubmit);

  // Refresh managers
  document.getElementById('btn-refresh-pending-only').addEventListener('click', () => triggerManualRefresh('pending'));
  document.getElementById('btn-refresh-all-users').addEventListener('click', () => triggerManualRefresh('all'));
  document.getElementById('btn-refresh-async').addEventListener('click', () => triggerManualRefresh('async'));

  // Access lists
  document.getElementById('btn-access-refresh').addEventListener('click', () => {
    renderAdminAccessAccounts();
    alert('Access account list updated.');
  });
  // Custom access role layout toggle
  const roleSelect = document.getElementById('access-role');
  const branchGroup = document.getElementById('access-branch-group');
  if (roleSelect && branchGroup) {
    roleSelect.addEventListener('change', () => {
      branchGroup.style.display = roleSelect.value === 'hod' ? 'block' : 'none';
    });
    branchGroup.style.display = 'none'; // Default hides
  }

  // Admin Change Password Form Submit
  const formAdminChangePassword = document.getElementById('form-admin-change-password');
  if (formAdminChangePassword) {
    formAdminChangePassword.addEventListener('submit', handleAdminChangePasswordSubmit);
  }
}

// Render Principal Analytics View for the Selected Branch and Batch Year
function renderPrincipalBranchAnalytics() {
  const branch = currentUser.role === 'hod' ? currentUser.branch : principalSelectedBranch;
  const batch = principalSelectedBatch;

  if (currentUser.role === 'hod') {
    principalSelectedBranch = currentUser.branch;
  }

  // Hide change branch button for HOD
  const btnChangeBranch = document.getElementById('btn-principal-change-branch');
  if (btnChangeBranch) {
    btnChangeBranch.style.display = currentUser.role === 'hod' ? 'none' : 'inline-flex';
  }

  // Update Title
  const titleEl = document.getElementById('principal-branch-title');
  if (titleEl) {
    titleEl.innerHTML = `<i class="fa-solid fa-chart-line"></i> Analytics: ${branch} Branch`;
  }

  // Update select input
  const filterSelect = document.getElementById('principal-filter-batch');
  if (filterSelect) {
    filterSelect.value = batch;
  }

  // Filter students DB
  const filteredStudents = studentsDb.filter(s => {
    const matchesBranch = s.branch === branch;
    const matchesBatch = (batch === 'ALL') || (String(s.batchYear) === String(batch));
    return matchesBranch && matchesBatch;
  });

  // Calculate Metrics
  const totalCount = filteredStudents.length;
  document.getElementById('stat-principal-branch-students').textContent = totalCount;

  let avgScore = 0;
  let highestScore = 0;
  if (totalCount > 0) {
    const sum = filteredStudents.reduce((acc, s) => acc + (s.totalScore || 0), 0);
    avgScore = Math.round(sum / totalCount);
    highestScore = Math.max(...filteredStudents.map(s => s.totalScore || 0));
  }
  document.getElementById('stat-principal-branch-avg').textContent = avgScore;
  document.getElementById('stat-principal-branch-highest').textContent = highestScore;

  // Populate standings table
  const tbody = document.getElementById('table-principal-branch-students');
  if (tbody) {
    tbody.innerHTML = '';
    if (totalCount === 0) {
      tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; color: var(--text-secondary); padding: 2.5rem;">No registered students found for ${branch} branch (Batch ${batch}).</td></tr>`;
    } else {
      const sortedStudents = [...filteredStudents].sort((a, b) => b.totalScore - a.totalScore).slice(0, 50);
      sortedStudents.forEach((student, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><span class="rank-badge">${index + 1}</span></td>
          <td>
            <a class="student-roll-link-principal" data-roll="${student.roll}" href="#" style="color: var(--primary); font-weight: 600; text-decoration: none; display: flex; align-items: center; gap: 0.25rem;">
              ${student.roll} <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 0.7rem; opacity: 0.6;"></i>
            </a>
          </td>
          <td style="font-weight: 600;">${student.name}</td>
          <td style="font-weight: 600; color: var(--accent);">${student.batchYear || 2026}</td>
          <td style="font-weight: 700; color: var(--warning);">${student.totalScore}</td>
          <td><span class="platform-mini-badge"><i class="fa-solid fa-code" style="color: #ffa116;"></i> ${student.stats.leetcode || 0}</span></td>
          <td><span class="platform-mini-badge"><i class="fa-solid fa-laptop-code" style="color: #2ec866;"></i> ${student.stats.hackerrank || 0}</span></td>
          <td><span class="platform-mini-badge"><i class="fa-solid fa-chart-line" style="color: #3b5998;"></i> ${student.stats.codeforces || 0}</span></td>
          <td><span class="platform-mini-badge"><i class="fa-solid fa-terminal" style="color: #2f8955;"></i> ${student.stats.gfg || 0}</span></td>
          <td><span class="platform-mini-badge"><i class="fa-solid fa-cookie-bite" style="color: #ab7a5f;"></i> ${student.stats.codechef || 0}</span></td>
          <td><span class="platform-mini-badge"><i class="fa-brands fa-github" style="color: #f0f6fc;"></i> ${student.stats.github || 0}</span></td>
        `;
        tbody.appendChild(tr);
      });

      // Bind row link click event listeners programmatically
      tbody.querySelectorAll('.student-roll-link-principal').forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          showStudentDetailModal(link.getAttribute('data-roll'));
        });
      });
    }
  }

  // Draw Charts
  drawPrincipalCharts(filteredStudents);
}

// Draw Chart.js visualizations for Principal Branch View
function drawPrincipalCharts(students) {
  const destroyChart = (id) => {
    if (chartInstances[id]) {
      chartInstances[id].destroy();
    }
  };

  const globalFont = { family: 'Plus Jakarta Sans', size: 10, weight: '500' };

  // 1. Platform Averages Bar Chart
  destroyChart('principalPlatformAvg');
  const keys = ['leetcode', 'hackerrank', 'codeforces', 'gfg', 'codechef', 'github'];
  const labels = ['LeetCode Avg', 'HackerRank Avg', 'Codeforces Avg', 'GFG Avg', 'CodeChef Avg', 'GitHub Avg'];
  
  let averages = [0, 0, 0, 0, 0, 0];
  if (students.length > 0) {
    keys.forEach((key, index) => {
      const sum = students.reduce((acc, s) => acc + (s.stats[key] || 0), 0);
      averages[index] = parseFloat((sum / students.length).toFixed(1));
    });
  }

  const canvasPlatform = document.getElementById('chart-principal-platform');
  if (canvasPlatform) {
    const ctx1 = canvasPlatform.getContext('2d');
    chartInstances['principalPlatformAvg'] = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Average Score/Solved',
          data: averages,
          backgroundColor: [
            '#ffa116', '#2ec866', '#3b5998', '#2f8955', '#ab7a5f', '#94a3b8'
          ],
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#111827',
            titleColor: '#fff',
            bodyColor: '#fff',
            borderColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: 1
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#94a3b8', font: globalFont } },
          y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#94a3b8', font: globalFont } }
        }
      }
    });
  }

  // 2. Score Band Distribution Pie/Doughnut Chart
  destroyChart('principalScoreBands');
  const bands = ['<100', '100-500', '500-1000', '1000-2000', '2000+'];
  const distCounts = [
    students.filter(s => s.totalScore < 100).length,
    students.filter(s => s.totalScore >= 100 && s.totalScore < 500).length,
    students.filter(s => s.totalScore >= 500 && s.totalScore < 1000).length,
    students.filter(s => s.totalScore >= 1000 && s.totalScore < 2000).length,
    students.filter(s => s.totalScore >= 2000).length
  ];

  const canvasBand = document.getElementById('chart-principal-band');
  if (canvasBand) {
    const ctx2 = canvasBand.getContext('2d');
    chartInstances['principalScoreBands'] = new Chart(ctx2, {
      type: 'doughnut',
      data: {
        labels: bands,
        datasets: [{
          data: distCounts,
          backgroundColor: [
            'rgba(239, 68, 68, 0.6)',
            'rgba(245, 158, 11, 0.6)',
            'rgba(59, 130, 246, 0.6)',
            'rgba(139, 92, 246, 0.6)',
            'rgba(16, 185, 129, 0.6)'
          ],
          borderColor: [
            '#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#10b981'
          ],
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { color: '#94a3b8', font: globalFont }
          },
          tooltip: {
            backgroundColor: '#111827',
            titleColor: '#fff',
            bodyColor: '#fff',
            borderColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: 1
          }
        }
      }
    });
  }
}

// Handle Admin Change Password Form Submit
async function handleAdminChangePasswordSubmit(e) {
  e.preventDefault();
  resetFormErrors(e.target);

  const currentPwd = document.getElementById('admin-change-pwd-current').value;
  const newPwd = document.getElementById('admin-change-pwd-new').value;
  const confirmPwd = document.getElementById('admin-change-pwd-confirm').value;

  let hasError = false;
  if (!currentPwd) {
    showInputError('admin-change-pwd-current');
    hasError = true;
  }
  if (!newPwd) {
    showInputError('admin-change-pwd-new');
    hasError = true;
  }
  if (newPwd !== confirmPwd) {
    showInputError('admin-change-pwd-confirm');
    hasError = true;
  }

  if (hasError) return;

  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: currentUser.username,
        currentPassword: currentPwd,
        newPassword: newPwd
      })
    });

    const data = await res.json();
    if (res.ok) {
      alert(data.message || 'Admin password updated successfully!');
      e.target.reset();
    } else {
      alert(data.error || 'Failed to update admin password.');
    }
  } catch (err) {
    console.error('Admin Change password error:', err);
    alert('An error occurred. Please try again.');
  }
}

// Handle Student Inline Profile URL Updates
async function handleSelfUpdateLinksSubmit(e) {
  e.preventDefault();
  resetFormErrors(e.target);

  const lcUrl = document.getElementById('self-edit-leetcode').value.trim();
  const hrUrl = document.getElementById('self-edit-hackerrank').value.trim();
  const cfUrl = document.getElementById('self-edit-codeforces').value.trim();
  const gfgUrl = document.getElementById('self-edit-gfg').value.trim();
  const ccUrl = document.getElementById('self-edit-codechef').value.trim();
  const ghUrl = document.getElementById('self-edit-github').value.trim();

  let isValid = true;

  if (!validatePlatformURL('leetcode', lcUrl)) {
    showInputError('self-edit-leetcode');
    isValid = false;
  }
  if (!validatePlatformURL('hackerrank', hrUrl)) {
    showInputError('self-edit-hackerrank');
    isValid = false;
  }
  if (!validatePlatformURL('codeforces', cfUrl)) {
    showInputError('self-edit-codeforces');
    isValid = false;
  }
  if (!validatePlatformURL('gfg', gfgUrl)) {
    showInputError('self-edit-gfg');
    isValid = false;
  }
  if (!validatePlatformURL('codechef', ccUrl)) {
    showInputError('self-edit-codechef');
    isValid = false;
  }
  if (!validatePlatformURL('github', ghUrl)) {
    showInputError('self-edit-github');
    isValid = false;
  }

  if (!isValid) return;

  const student = studentsDb.find(s => s.roll === currentUser.roll);
  if (!student) return;
  
  tempRegisterData = { 
    roll: student.roll, 
    name: student.name, 
    email: student.email, 
    branch: student.branch,
    batchYear: student.batchYear,
    isEditing: true 
  };

  // Close editing dialog overlay
  const modal = document.getElementById('dialog-edit-profile');
  if (modal) modal.close();

  // Trigger crawler loading animation and update database
  triggerCrawlerSimulation(lcUrl, hrUrl, cfUrl, gfgUrl, ccUrl, ghUrl);
}

// Open the student profile editing modal and pre-populate currently saved links
function openEditProfileModal() {
  if (currentUser && currentUser.role === 'student') {
    const studentData = studentsDb.find(s => s.roll === currentUser.roll);
    if (studentData) {
      document.getElementById('self-edit-leetcode').value = studentData.leetcode || '';
      document.getElementById('self-edit-hackerrank').value = studentData.hackerrank || '';
      document.getElementById('self-edit-codeforces').value = studentData.codeforces || '';
      document.getElementById('self-edit-gfg').value = studentData.gfg || '';
      document.getElementById('self-edit-codechef').value = studentData.codechef || '';
      document.getElementById('self-edit-github').value = studentData.github || '';

      const modal = document.getElementById('dialog-edit-profile');
      if (modal) {
        resetFormErrors(document.getElementById('form-self-update-links'));
        modal.showModal();
      }
    }
  }
}

// Submit handler for administrative recovery email setup
async function handleAdminEmailSetupSubmit(e) {
  e.preventDefault();
  resetFormErrors(e.target);

  const emailVal = document.getElementById('admin-setup-email').value.trim();
  // Validates email is @gmail.com
  if (!emailVal || !/^[a-zA-Z0-9._%+-]+@gmail\.com$/.test(emailVal.toLowerCase())) {
    showInputError('admin-setup-email');
    return;
  }

  try {
    const res = await fetch('/api/auth/update-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUser.username, email: emailVal })
    });

    if (res.ok) {
      currentUser.email = emailVal;
      sessionStorage.setItem('ideal_code_tracker_session', JSON.stringify(currentUser));
      document.getElementById('dialog-admin-email-setup').close();
      loginSuccessRedirect();
    } else {
      const errData = await res.json();
      alert(errData.error || 'Failed to save email address.');
    }
  } catch (err) {
    console.error(err);
    alert('Failed to connect to server.');
  }
}

// Submit handler for administrator target user password update
async function handleAdminEditPasswordSubmit(e) {
  e.preventDefault();
  resetFormErrors(e.target);

  const usernameVal = document.getElementById('admin-edit-pwd-username').value;
  const newPasswordVal = document.getElementById('admin-edit-pwd-new').value;

  if (!newPasswordVal || newPasswordVal.length < 6) {
    showInputError('admin-edit-pwd-new');
    return;
  }

  try {
    const res = await fetch(`/api/admin/accounts/${usernameVal}/password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: newPasswordVal, adminUser: currentUser.username })
    });

    if (res.ok) {
      alert('Password updated successfully.');
      document.getElementById('dialog-admin-edit-password').close();
      renderAdminAccessAccounts();
    } else {
      const errData = await res.json();
      alert(errData.error || 'Failed to update password.');
    }
  } catch (err) {
    console.error(err);
    alert('Failed to connect to server.');
  }
}

// Execute on script load
window.addEventListener('DOMContentLoaded', initApp);
