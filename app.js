const STORAGE_KEY = 'ideal_code_tracker_db';

// App State
let studentsDb = [];
let currentUser = null;
let currentRole = 'student'; // 'student' | 'hod' | 'principal' | 'admin' | 'internship_coordinator'
let activeWidgetPanel = 'panel-individual';
let activeBatchYear = 'ALL';
let activeAdminPanel = 'admin-panel-dashboard';
let chartInstances = {};
let principalSelectedBranch = 'CSE';
let principalSelectedBatch = 'ALL';

// V2: Internship State
let internshipTitlesDb = [];
let studentSubmissionsDb = [];
let icDraftItems = []; // Draft items being built for a new IC title
let icOverviewData = {};
let otpEmailVerified = false;
let otpTimerInterval = null;

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
    await loadGlobalInternshipData();
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

  // Forgot Password handlers removed



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

  // ── V2: Hook up new event listeners ──
  setupICEventListeners();
  setupStudentInternshipEventListeners();
  setupAdminInternshipEventListeners();

  // Admin internship panel switch
  const btnAdminInternships = document.getElementById('btn-admin-internships');
  if (btnAdminInternships) {
    btnAdminInternships.addEventListener('click', () => {
      switchAdminPanel('admin-panel-internships', btnAdminInternships);
      loadAdminInternships();
    });
  }
}

// Helper to switch visual auth sections (Login, Register1, Register2)
function showAuthSection(sectionId) {
  const sections = ['section-login', 'section-register-1', 'section-register-2'];
  sections.forEach(id => {
    document.getElementById(id).style.display = id === sectionId ? 'block' : 'none';
  });
}

// Helper to switch global views
function switchView(viewId) {
  if (viewId !== 'view-auth' && !currentUser) {
    viewId = 'view-auth';
  }

  const views = ['view-auth', 'view-dashboard', 'view-student-profile', 'view-admin', 'view-ic', 'view-student-internships'];
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
    
    // Set active batch year dynamically based on role
    if (currentUser.role === 'student') {
      const student = studentsDb.find(s => (s.roll || s.username) === (currentUser.roll || currentUser.username));
      activeBatchYear = student ? String(student.batchYear || student.batch_year || 'ALL') : 'ALL';
    } else {
      activeBatchYear = 'ALL';
    }

    // Update active class on batch selection buttons in UI
    document.querySelectorAll('.floating-batch-widget').forEach(widget => {
      widget.querySelectorAll('.batch-btn').forEach(b => {
        if (b.getAttribute('data-batch') === activeBatchYear) {
          b.classList.add('active');
        } else {
          b.classList.remove('active');
        }
      });
    });



    // Refresh student data from server
    await fetchStudents();
    loginSuccessRedirect();
  } catch (err) {
    console.error('Login error:', err);
    alert('Failed to log in. Please try again.');
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
async function loginSuccessRedirect() {
  await loadGlobalInternshipData();

  // Update header elements
  const userInfo = document.getElementById('nav-user-info');
  const userRole = document.getElementById('nav-user-role');
  
  userInfo.innerHTML = `<i class="fa-solid fa-circle-user" style="font-size: 1.5rem; cursor: pointer;" title="${escapeHtml(currentUser.name)}"></i>`;
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
    document.getElementById('ic-widgets').style.display = 'none';
    document.getElementById('admin-widgets').style.display = 'flex';
    switchView('view-admin');
    
    // Default to dashboard subpanel
    const dashBtn = document.getElementById('btn-admin-dashboard');
    switchAdminPanel('admin-panel-dashboard', dashBtn);
  } else if (currentUser.role === 'internship_coordinator') {
    // IC portal
    document.getElementById('nav-widgets').style.display = 'none';
    document.getElementById('admin-widgets').style.display = 'none';
    document.getElementById('ic-widgets').style.display = 'flex';
    switchView('view-ic');
    loadInternshipTitles();
  } else {
    document.getElementById('nav-widgets').style.display = 'flex';
    document.getElementById('ic-widgets').style.display = 'none';
    document.getElementById('admin-widgets').style.display = 'none';
    
    if (currentUser.role === 'student') {
      // Show internship button for students
      const btnInternships = document.getElementById('btn-widget-internships');
      if (btnInternships) btnInternships.style.display = 'inline-block';

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
    loadStudentInternships();
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
  // OTP check removed as per client request
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
  if (!currentUser) {
    switchView('view-auth');
    return;
  }
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
      ${buildInternshipCells(student.roll)}
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

  // Construct CSV Header
  const titles = internshipTitlesDb;
  let titleHeaders = titles.map(t => `"${t.title.toUpperCase()}"`).join(',');
  let csvContent = `Rank,Roll Number,Name,Branch,Gmail,Total Score,LeetCode Solved,HackerRank Score,Codeforces Rating,GeeksforGeeks Solved,CodeChef Solved,GitHub Repos,${titleHeaders}\n`;
  
  // Cache submissions
  const submissionsSource = studentSubmissionsDb;
  const submissionsMap = {};
  submissionsSource.forEach(sub => {
    if (sub.submitted) {
      if (!submissionsMap[sub.student_roll]) {
        submissionsMap[sub.student_roll] = {};
      }
      submissionsMap[sub.student_roll][sub.title_id] = sub;
    }
  });

  list.forEach(s => {
    let titleValues = [];
    titles.forEach(title => {
      const sub = submissionsMap[s.roll] ? submissionsMap[s.roll][title.id] : null;
      if (!sub) {
        titleValues.push('—');
      } else {
        const itemIds = sub.item_ids ? sub.item_ids.split(',').filter(Boolean).map(Number) : [];
        const submittedItems = (title.items || []).filter(it => itemIds.includes(it.id));
        const itemsText = submittedItems.map(it => it.name).join('; ') || 'None';
        titleValues.push(itemsText);
      }
    });

    let rowValues = titleValues.map(v => `"${v}"`).join(',');
    csvContent += `${s.globalRank},"${s.roll}","${s.name}","${s.branch}","${s.email}",${s.totalScore},${s.stats.leetcode || 0},${s.stats.hackerrank || 0},${s.stats.codeforces || 0},${s.stats.gfg || 0},${s.stats.codechef || 0},${s.stats.github || 0},${rowValues}\n`;
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
    const colSpan = 12 + (internshipTitlesDb.length || 1);
    tbody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align: center; color: var(--text-muted); padding: 2rem;">No students found matching filters.</td></tr>`;
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
      ${buildInternshipCells(s.roll)}
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
      tbody.innerHTML = `<tr><td colspan="12" style="text-align: center; color: var(--text-secondary); padding: 2.5rem;">No registered students found for ${branch} branch (Batch ${batch}).</td></tr>`;
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
          ${buildInternshipCells(student.roll)}
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

// ============================================================
// V2: INTERNSHIP COORDINATOR (IC) PORTAL
// ============================================================

async function loadInternshipTitles() {
  try {
    const res = await fetch('/api/internships/titles');
    const data = await res.json();
    internshipTitlesDb = data.titles || [];
    renderICPublishedTitles();
    renderICStudentList();
    renderICOverviewFilterOptions();
  } catch (err) {
    console.error('Load internship titles error:', err);
  }
}

function setupICEventListeners() {
  // IC Panel Tab Buttons
  const btnICPublish = document.getElementById('btn-ic-publish');
  const btnICOverview = document.getElementById('btn-ic-overview');

  if (btnICPublish) {
    btnICPublish.addEventListener('click', () => {
      document.querySelectorAll('#ic-widgets .floating-widget-btn').forEach(b => b.classList.remove('active'));
      btnICPublish.classList.add('active');
      document.querySelectorAll('.ic-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('ic-panel-publish').classList.add('active');
      renderICStudentList();
    });
  }

  if (btnICOverview) {
    btnICOverview.addEventListener('click', () => {
      document.querySelectorAll('#ic-widgets .floating-widget-btn').forEach(b => b.classList.remove('active'));
      btnICOverview.classList.add('active');
      document.querySelectorAll('.ic-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('ic-panel-overview').classList.add('active');
      loadICOverview();
    });
  }

  // IC Student List Filters
  const icBranchFilter = document.getElementById('ic-filter-branch');
  const icBatchFilter = document.getElementById('ic-filter-batch');
  if (icBranchFilter) icBranchFilter.addEventListener('change', renderICStudentList);
  if (icBatchFilter) icBatchFilter.addEventListener('change', renderICStudentList);

  // IC Add Item Button
  const btnAddItem = document.getElementById('btn-ic-add-item');
  if (btnAddItem) {
    btnAddItem.addEventListener('click', () => {
      const input = document.getElementById('ic-new-item-input');
      const val = input.value.trim();
      if (!val) return;
      icDraftItems.push(val);
      input.value = '';
      renderICDraftItems();
    });
  }

  // Allow Enter key in item input
  const itemInput = document.getElementById('ic-new-item-input');
  if (itemInput) {
    itemInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('btn-ic-add-item').click();
      }
    });
  }

  // IC Publish Title Button
  const btnPublishTitle = document.getElementById('btn-ic-publish-title');
  if (btnPublishTitle) {
    btnPublishTitle.addEventListener('click', handleICPublishTitle);
  }

  // IC Overview filters
  ['ic-ov-filter-branch', 'ic-ov-filter-batch', 'ic-ov-filter-title', 'ic-ov-search'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', renderICOverviewTable);
  });

  // IC Overview Export CSV Button
  const btnICExportCSV = document.getElementById('btn-ic-export-csv');
  if (btnICExportCSV) {
    btnICExportCSV.addEventListener('click', handleICCSVDownload);
  }
}

function renderICStudentList() {
  const listEl = document.getElementById('ic-student-list');
  const countEl = document.getElementById('ic-student-count');
  if (!listEl) return;

  const branchFilter = document.getElementById('ic-filter-branch')?.value || 'ALL';
  const batchFilter = document.getElementById('ic-filter-batch')?.value || 'ALL';

  let filtered = studentsDb;
  if (branchFilter !== 'ALL') filtered = filtered.filter(s => s.branch === branchFilter);
  if (batchFilter !== 'ALL') filtered = filtered.filter(s => String(s.batchYear) === batchFilter);

  if (filtered.length === 0) {
    listEl.innerHTML = '<div class="no-internships-msg">No students match this filter.</div>';
    if (countEl) countEl.textContent = '0 students';
    return;
  }

  if (countEl) countEl.textContent = `${filtered.length} student${filtered.length !== 1 ? 's' : ''}`;

  listEl.innerHTML = filtered.map(s => {
    const initials = s.name ? s.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : '??';
    return `<div class="ic-student-row">
      <div class="ic-student-avatar">${initials}</div>
      <div>
        <div class="ic-student-name">${escapeHtml(s.name)}</div>
        <div class="ic-student-meta">${escapeHtml(s.roll)} · ${s.branch} · ${s.batchYear}</div>
      </div>
    </div>`;
  }).join('');
}

function renderICDraftItems() {
  const list = document.getElementById('ic-draft-items-list');
  if (!list) return;
  if (icDraftItems.length === 0) {
    list.innerHTML = '';
    return;
  }
  list.innerHTML = icDraftItems.map((item, idx) => `
    <div class="ic-item-row">
      <span>${escapeHtml(item)}</span>
      <button class="btn-ic-delete-item" onclick="removeDraftItem(${idx})" title="Remove"><i class="fa-solid fa-xmark"></i></button>
    </div>
  `).join('');
}

function removeDraftItem(idx) {
  icDraftItems.splice(idx, 1);
  renderICDraftItems();
}

async function handleICPublishTitle() {
  const titleInput = document.getElementById('ic-new-title');
  const titleVal = titleInput.value.trim();
  const branchVal = getMultiselectValues('ic-pub-branch-options');
  const batchVal = getMultiselectValues('ic-pub-batch-options');

  if (!titleVal) {
    alert('Please enter a title name before publishing.');
    titleInput.focus();
    return;
  }
  if (icDraftItems.length === 0) {
    alert('Please add at least one internship company/project name.');
    return;
  }

  const coordinatorName = currentUser ? currentUser.name : 'Coordinator';

  try {
    const res = await fetch('/api/internships/titles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: titleVal,
        coordinator: coordinatorName,
        filterBranch: branchVal,
        filterBatch: batchVal
      })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Failed to publish title.');
      return;
    }

    const newTitleId = data.id;
    // Add all draft items
    for (const itemName of icDraftItems) {
      await fetch(`/api/internships/titles/${newTitleId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: itemName })
      });
    }

    alert(`✅ Successfully published "${titleVal}" with ${icDraftItems.length} internship entries!`);
    // Reset
    titleInput.value = '';
    icDraftItems = [];
    renderICDraftItems();
    await loadInternshipTitles();
  } catch (err) {
    console.error('Publish title error:', err);
    alert('Failed to publish. Please try again.');
  }
}

function renderICPublishedTitles() {
  const list = document.getElementById('ic-published-titles-list');
  if (!list) return;

  if (internshipTitlesDb.length === 0) {
    list.innerHTML = '<div class="no-internships-msg">No titles published yet.</div>';
    return;
  }

  list.innerHTML = internshipTitlesDb.map(t => {
    const filterLabel = [
      t.filter_branch && t.filter_branch !== 'ALL' ? t.filter_branch : null,
      t.filter_batch && t.filter_batch !== 'ALL' ? t.filter_batch : null
    ].filter(Boolean).join(' · ') || 'All Students';

    const itemsHtml = (t.items || []).map(item =>
      `<span class="ic-chip">${escapeHtml(item.name)}<button class="btn-chip-delete" onclick="deleteInternshipItem(${item.id}, ${t.id})" title="Delete item"><i class="fa-solid fa-xmark"></i></button></span>`
    ).join('');

    return `<div class="ic-published-title-card">
      <div class="ic-published-title-header" style="display:flex;justify-content:space-between;align-items:center;">
        <strong><i class="fa-solid fa-briefcase"></i> ${escapeHtml(t.title)}</strong>
        <div style="display:flex;gap:0.35rem;">
          <button class="btn btn-warning" style="font-size:0.75rem;padding:0.2rem 0.6rem;background:rgba(245,158,11,0.15);color:#f59e0b;border:1px solid rgba(245,158,11,0.3);cursor:pointer;" onclick="editPublishedTitle(${t.id}, '${escapeHtml(t.title)}')" title="Edit Title / Add Items"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-danger" style="font-size:0.75rem;padding:0.2rem 0.6rem;" onclick="deleteInternshipTitle(${t.id})"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
      <div class="ic-title-meta"><i class="fa-solid fa-filter"></i> ${filterLabel} &nbsp;·&nbsp; <i class="fa-solid fa-calendar"></i> ${new Date(t.created_at).toLocaleDateString()}</div>
      <div class="ic-published-items-list">${itemsHtml || '<span style="color:var(--text-muted);font-size:0.8rem;">No items</span>'}</div>
    </div>`;
  }).join('');
}

async function deleteInternshipTitle(titleId) {
  if (!confirm('Delete this internship title and all its items? Student submissions for this title will remain.')) return;
  try {
    await fetch(`/api/internships/titles/${titleId}?coordinator=${encodeURIComponent(currentUser?.name || '')}`, { method: 'DELETE' });
    await loadInternshipTitles();
  } catch (err) {
    console.error('Delete title error:', err);
    alert('Failed to delete title.');
  }
}

async function deleteInternshipItem(itemId, titleId) {
  if (!confirm('Remove this internship item?')) return;
  try {
    await fetch(`/api/internships/items/${itemId}`, { method: 'DELETE' });
    await loadInternshipTitles();
  } catch (err) {
    console.error('Delete item error:', err);
    alert('Failed to delete item.');
  }
}

async function loadICOverview() {
  try {
    const res = await fetch('/api/internships/overview');
    const data = await res.json();
    icOverviewData = data;
    renderICOverviewFilterOptions();
    renderICOverviewTable();
  } catch (err) {
    console.error('IC overview load error:', err);
  }
}

function renderICOverviewFilterOptions() {
  const titleFilter = document.getElementById('ic-ov-filter-title');
  if (!titleFilter) return;
  const current = titleFilter.value;
  titleFilter.innerHTML = '<option value="ALL">All Titles</option>' +
    internshipTitlesDb.map(t => `<option value="${t.id}">${escapeHtml(t.title)}</option>`).join('');
  if (current) titleFilter.value = current;
}

function renderICOverviewTable() {
  const tbody = document.getElementById('ic-overview-tbody');
  if (!tbody) return;

  const { submissions = [], titles = [], students = [] } = icOverviewData;
  const branchF = document.getElementById('ic-ov-filter-branch')?.value || 'ALL';
  const batchF = document.getElementById('ic-ov-filter-batch')?.value || 'ALL';
  const search = (document.getElementById('ic-ov-search')?.value || '').toLowerCase().trim();

  // Filter students based on branch, batch, and search inputs first
  let filteredStudents = students;
  if (branchF !== 'ALL') filteredStudents = filteredStudents.filter(s => s.branch === branchF);
  if (batchF !== 'ALL') filteredStudents = filteredStudents.filter(s => String(s.batchYear) === batchF || String(s.batch_year) === batchF);
  if (search) filteredStudents = filteredStudents.filter(s =>
    (s.roll || '').toLowerCase().includes(search) ||
    (s.name || '').toLowerCase().includes(search)
  );

  // Group submissions by student roll
  const submissionsMap = {}; // roll -> { title_id -> sub }
  submissions.forEach(sub => {
    if (sub.submitted) {
      if (!submissionsMap[sub.student_roll]) {
        submissionsMap[sub.student_roll] = {};
      }
      submissionsMap[sub.student_roll][sub.title_id] = sub;
    }
  });

  // Only display students who have submitted at least one internship
  let rows = filteredStudents.filter(student => submissionsMap[student.roll]);

  // If a specific title filter is selected, filter the student rows to only those who submitted that title
  const titleF = document.getElementById('ic-ov-filter-title')?.value || 'ALL';
  if (titleF !== 'ALL') {
    rows = rows.filter(student => submissionsMap[student.roll] && submissionsMap[student.roll][Number(titleF)]);
  }

  if (rows.length === 0) {
    const colSpan = 4 + (titles.length || 1);
    tbody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align:center;color:var(--text-secondary);padding:2rem;">No submissions found.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(student => {
    const roll = student.roll;
    const name = student.name || '--';
    const branch = student.branch || '--';
    const batchYear = student.batchYear || student.batch_year || '--';

    if (titles.length === 0) {
      return `<tr>
        <td>${escapeHtml(roll)}</td>
        <td>${escapeHtml(name)}</td>
        <td>${branch}</td>
        <td>${batchYear}</td>
        <td><span class="no-internships-msg">—</span></td>
      </tr>`;
    }

    let titleCellsHtml = '';
    titles.forEach(title => {
      const sub = submissionsMap[roll] ? submissionsMap[roll][title.id] : null;
      if (!sub) {
        titleCellsHtml += '<td><span class="no-internships-msg">—</span></td>';
      } else {
        const itemIds = sub.item_ids ? sub.item_ids.split(',').filter(Boolean).map(Number) : [];
        const submittedItems = (title.items || []).filter(it => itemIds.includes(it.id));
        const itemsHtml = submittedItems.length > 0
          ? submittedItems.map(it => `<span class="internship-tag" title="${escapeHtml(title.title)}">${escapeHtml(it.name)}</span>`).join('')
          : '<span class="no-internships-msg">—</span>';
        titleCellsHtml += `<td>${itemsHtml}</td>`;
      }
    });

    return `<tr>
      <td>${escapeHtml(roll)}</td>
      <td>${escapeHtml(name)}</td>
      <td>${branch}</td>
      <td>${batchYear}</td>
      ${titleCellsHtml}
    </tr>`;
  }).join('');
}

// ============================================================
// V2: STUDENT INTERNSHIP PORTAL
// ============================================================

function setupStudentInternshipEventListeners() {
  // Internship tab button click
  const btnInternships = document.getElementById('btn-widget-internships');
  if (btnInternships) {
    btnInternships.addEventListener('click', () => {
      document.querySelectorAll('#nav-widgets .floating-widget-btn').forEach(b => b.classList.remove('active'));
      btnInternships.classList.add('active');
      switchView('view-student-internships');
      loadStudentInternships();
    });
  }
}

async function loadStudentInternships() {
  if (!currentUser || currentUser.role !== 'student') return;

  try {
    const [titlesRes, submissionsRes] = await Promise.all([
      fetch('/api/internships/titles'),
      fetch(`/api/internships/student/${currentUser.roll || currentUser.username}`)
    ]);

    const titlesData = await titlesRes.json();
    const submissionsData = await submissionsRes.json();

    internshipTitlesDb = titlesData.titles || [];
    studentSubmissionsDb = submissionsData.submissions || [];

    renderStudentInternshipProfile();
    renderStudentInternshipTitles();
  } catch (err) {
    console.error('Load student internships error:', err);
  }
}

function renderStudentInternshipProfile() {
  if (!currentUser) return;
  const name = currentUser.name || '--';
  const roll = currentUser.roll || currentUser.username;
  const branch = currentUser.branch || '--';
  const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

  const avatarEl = document.getElementById('si-avatar');
  const nameEl = document.getElementById('si-name');
  const rollEl = document.getElementById('si-roll');
  const branchEl = document.getElementById('si-branch');
  const countEl = document.getElementById('si-submitted-count');

  if (avatarEl) avatarEl.textContent = initials;
  if (nameEl) nameEl.textContent = name;
  if (rollEl) rollEl.textContent = roll;
  if (branchEl) branchEl.textContent = branch;
  if (countEl) countEl.textContent = studentSubmissionsDb.filter(s => s.submitted).length;
}

function getStudentBatch() {
  const student = studentsDb.find(s => (s.roll || s.username) === (currentUser.roll || currentUser.username));
  return student ? String(student.batchYear || student.batch_year || '') : '';
}

function renderStudentInternshipTitles() {
  const container = document.getElementById('student-internship-titles-container');
  if (!container) return;

  const studentBranch = currentUser?.branch || '';
  const studentBatch = getStudentBatch();

  // Filter titles visible to this student
  const visibleTitles = internshipTitlesDb.filter(t => {
    const matchBranch = !t.filter_branch || t.filter_branch === 'ALL' || t.filter_branch.split(',').includes(studentBranch);
    const matchBatch = !t.filter_batch || t.filter_batch === 'ALL' || t.filter_batch.split(',').includes(studentBatch);
    return matchBranch && matchBatch;
  });

  const emptyEl = document.getElementById('student-internship-empty');

  if (visibleTitles.length === 0) {
    if (emptyEl) emptyEl.style.display = 'block';
    // Remove old title cards
    container.querySelectorAll('.internship-title-card').forEach(el => el.remove());
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';

  // Remove old cards first
  container.querySelectorAll('.internship-title-card').forEach(el => el.remove());

  const studentRoll = currentUser.roll || currentUser.username;

  visibleTitles.forEach(title => {
    const submission = studentSubmissionsDb.find(s => s.title_id === title.id);
    const isLocked = submission && submission.submitted;
    const checkedItemIds = isLocked && submission.item_ids
      ? submission.item_ids.split(',').filter(Boolean).map(Number)
      : [];

    const card = document.createElement('div');
    card.className = `internship-title-card${isLocked ? ' locked' : ''}`;
    card.dataset.titleId = title.id;

    const itemsHtml = (title.items || [])
      .filter(item => !isLocked || checkedItemIds.includes(item.id))
      .map(item => {
        const isChecked = isLocked ? checkedItemIds.includes(item.id) : false;
        return `<div class="internship-item-checkbox-row${isChecked ? ' checked' : ''}${isLocked ? ' locked-item' : ''}" data-item-id="${item.id}">
          <input type="checkbox" id="intern-item-${title.id}-${item.id}" ${isChecked ? 'checked' : ''} ${isLocked ? 'disabled' : ''}>
          <label for="intern-item-${title.id}-${item.id}">${escapeHtml(item.name)}</label>
          <i class="fa-solid fa-circle-check internship-item-checked-icon"></i>
        </div>`;
      }).join('');

    card.innerHTML = `
      <div class="internship-title-card-header" style="display:flex; align-items:center; justify-content:space-between; gap:1rem;">
        <div style="display:flex; align-items:center; gap:0.65rem;">
          <h3><i class="fa-solid fa-briefcase"></i> ${escapeHtml(title.title)}</h3>
          <button class="btn-ic-collapse" onclick="toggleInternshipCardCollapse(${title.id}, this)" style="background:none; border:none; color:var(--text-secondary); cursor:pointer; font-size:0.85rem; display:flex; align-items:center; justify-content:center; padding: 0.2rem; transition: color 0.2s;" title="Toggle Collapse">
            <i class="fa-solid fa-chevron-up"></i>
          </button>
        </div>
        ${isLocked
          ? `<span class="internship-locked-badge"><i class="fa-solid fa-lock"></i> Submitted</span>`
          : `<span style="font-size:0.78rem;color:var(--text-secondary);">Select internships you completed</span>`
        }
      </div>
      <div class="internship-items-grid">${itemsHtml}</div>
      <button class="btn-internship-submit" data-title-id="${title.id}" ${isLocked ? 'disabled' : ''}>
        ${isLocked ? '<i class="fa-solid fa-lock"></i> Submitted & Locked' : '<i class="fa-solid fa-paper-plane"></i> Submit Internship Details'}
      </button>
    `;

    // Checkbox toggle visual
    if (!isLocked) {
      card.querySelectorAll('.internship-item-checkbox-row').forEach(row => {
        row.addEventListener('click', (e) => {
          if (e.target.tagName === 'INPUT') return;
          const cb = row.querySelector('input[type="checkbox"]');
          if (cb && !cb.disabled) {
            cb.checked = !cb.checked;
            row.classList.toggle('checked', cb.checked);
          }
        });
        const cb = row.querySelector('input[type="checkbox"]');
        if (cb) {
          cb.addEventListener('change', () => {
            row.classList.toggle('checked', cb.checked);
          });
        }
      });
    }

    // Submit button
    const submitBtn = card.querySelector('.btn-internship-submit');
    if (submitBtn && !isLocked) {
      submitBtn.addEventListener('click', async () => {
        const checkedIds = [...card.querySelectorAll('.internship-item-checkbox-row input:checked')]
          .map(cb => parseInt(cb.closest('[data-item-id]').dataset.itemId));

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';

        try {
          const res = await fetch('/api/internships/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentRoll, titleId: title.id, itemIds: checkedIds })
          });
          const data = await res.json();
          if (!res.ok) {
            alert(data.error || 'Submission failed.');
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit Internship Details';
            return;
          }
          alert('✅ Internship details submitted successfully! Your submission is now locked.');
          await loadStudentInternships();
        } catch (err) {
          console.error('Submit internship error:', err);
          alert('Failed to submit. Please try again.');
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit Internship Details';
        }
      });
    }

    container.insertBefore(card, document.getElementById('student-internship-empty'));
  });
}

// ============================================================
// V2: ADMIN INTERNSHIP MANAGEMENT
// ============================================================

function setupAdminInternshipEventListeners() {
  const el = document.getElementById('admin-intern-search');
  if (el) el.addEventListener('input', renderAdminInternshipSubmissions);
}

async function loadAdminInternships() {
  try {
    const res = await fetch('/api/internships/overview');
    const data = await res.json();
    icOverviewData = data;
    renderAdminInternshipTitles();
    renderAdminInternshipSubmissions();
  } catch (err) {
    console.error('Admin internship load error:', err);
  }
}

function renderAdminInternshipTitles() {
  const el = document.getElementById('admin-internship-titles-list');
  if (!el) return;
  const { titles = [] } = icOverviewData;
  if (titles.length === 0) {
    el.innerHTML = '<div class="no-internships-msg">No internship titles published yet.</div>';
    return;
  }
  el.innerHTML = titles.map(t => `
    <div class="ic-published-title-card">
      <div class="ic-published-title-header">
        <strong>${escapeHtml(t.title)}</strong>
        <span style="font-size:0.78rem;color:var(--text-secondary);">${t.filter_branch !== 'ALL' ? t.filter_branch : 'All'} · ${t.filter_batch !== 'ALL' ? t.filter_batch : 'All'}</span>
      </div>
      <div class="ic-published-items-list">
        ${(t.items || []).map(item => `<span class="internship-tag">${escapeHtml(item.name)}</span>`).join('')}
      </div>
    </div>
  `).join('');
}

function renderAdminInternshipSubmissions() {
  const tbody = document.getElementById('admin-internship-submissions-tbody');
  if (!tbody) return;

  const { submissions = [], titles = [], students = [] } = icOverviewData;
  const branchF = getMultiselectValues('admin-intern-branch-options');
  const batchF = getMultiselectValues('admin-intern-batch-options');
  const search = (document.getElementById('admin-intern-search')?.value || '').toLowerCase().trim();

  const titleMap = Object.fromEntries(titles.map(t => [t.id, t]));
  const studentMap = Object.fromEntries(students.map(s => [s.roll, s]));

  let rows = submissions.map(sub => {
    const student = studentMap[sub.student_roll] || {};
    const title = titleMap[sub.title_id] || {};
    const itemIds = sub.item_ids ? sub.item_ids.split(',').filter(Boolean).map(Number) : [];
    const allItems = title.items || [];
    const submittedItems = allItems.filter(it => itemIds.includes(it.id));
    return { sub, student, title, submittedItems };
  });

  if (branchF !== 'ALL') {
    const branches = branchF.split(',');
    rows = rows.filter(r => branches.includes(r.student.branch));
  }
  if (batchF !== 'ALL') {
    const batches = batchF.split(',');
    rows = rows.filter(r =>
      batches.includes(String(r.student.batchYear)) || batches.includes(String(r.student.batch_year))
    );
  }
  if (search) rows = rows.filter(r =>
    (r.student.roll || r.sub.student_roll).toLowerCase().includes(search) ||
    (r.student.name || '').toLowerCase().includes(search)
  );

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-secondary);padding:2rem;">No submissions found.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(({ sub, student, title, submittedItems }) => {
    const roll = student.roll || sub.student_roll;
    const name = student.name || '--';
    const branch = student.branch || '--';
    const batch = student.batchYear || student.batch_year || '--';
    const titleName = title.title || `#${sub.title_id}`;
    const itemsHtml = submittedItems.length > 0
      ? submittedItems.map(it => `<span class="internship-tag">${escapeHtml(it.name)}</span>`).join('')
      : '<em style="color:var(--text-muted);">None</em>';
    const submittedAt = sub.submitted_at ? new Date(sub.submitted_at).toLocaleString() : '--';

    return `<tr>
      <td>${escapeHtml(roll)}</td>
      <td>${escapeHtml(name)}</td>
      <td>${branch}</td>
      <td>${batch}</td>
      <td>${escapeHtml(titleName)}</td>
      <td>${itemsHtml}</td>
      <td>${submittedAt}</td>
      <td><button class="btn btn-warning" style="font-size:0.75rem;padding:0.25rem 0.5rem;" onclick="adminEditInternshipSubmission('${roll}', ${sub.title_id})"><i class="fa-solid fa-pen"></i></button></td>
    </tr>`;
  }).join('');
}

async function adminEditInternshipSubmission(roll, titleId) {
  const titleData = internshipTitlesDb.find(t => t.id === titleId) ||
    (icOverviewData.titles || []).find(t => t.id === titleId);

  if (!titleData) {
    alert('Title data not found.');
    return;
  }

  const itemNames = (titleData.items || []).map(it => `${it.id}: ${it.name}`).join('\n');
  const currentSub = (icOverviewData.submissions || []).find(s => s.student_roll === roll && s.title_id === titleId);
  const currentIds = currentSub?.item_ids || '';

  const input = prompt(
    `Admin Edit: Internship submissions for ${roll}\n\nAvailable items (ID: Name):\n${itemNames}\n\nEnter comma-separated item IDs to mark as done:\nCurrent: ${currentIds}`
  );
  if (input === null) return;

  const newIds = input.split(',').map(s => s.trim()).filter(Boolean);

  try {
    const res = await fetch('/api/internships/admin/submission', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentRoll: roll,
        titleId,
        itemIds: newIds,
        adminUser: currentUser?.username
      })
    });
    const data = await res.json();
    if (res.ok) {
      alert('Submission updated successfully!');
      loadAdminInternships();
    } else {
      alert(data.error || 'Failed to update.');
    }
  } catch (err) {
    console.error(err);
    alert('Error updating submission.');
  }
}

// ============================================================
// V2: INTERNSHIP COLUMN IN STUDENT TABLES
// ============================================================

// Helper: build dynamic internship cells HTML (one cell per title) for a student
function buildInternshipCells(studentRoll) {
  const titles = internshipTitlesDb || [];
  const submissionsSource = studentSubmissionsDb || [];

  if (titles.length === 0) {
    return '<td><span class="no-internships-msg">—</span></td>';
  }

  const studentSubs = submissionsSource.filter(s =>
    s.student_roll === studentRoll && s.submitted
  );

  return titles.map(title => {
    const sub = studentSubs.find(s => s.title_id === title.id);
    if (!sub) return '<td><span class="no-internships-msg">—</span></td>';

    const itemIds = sub.item_ids ? sub.item_ids.split(',').filter(Boolean).map(Number) : [];
    const items = (title.items || []).filter(it => itemIds.includes(it.id));
    const itemsHtml = items.map(it => `<span class="internship-tag" title="${escapeHtml(title.title)}">${escapeHtml(it.name)}</span>`).join('');
    
    return `<td>${itemsHtml || '<span class="no-internships-msg">—</span>'}</td>`;
  }).join('');
}

// Rebuild headers for all student standings tables and coordinator overview table
function rebuildAllTableHeaders() {
  const titles = internshipTitlesDb || [];
  
  // 1. Rebuild main standings table headers
  const mainTable = document.getElementById('table-students');
  if (mainTable) {
    const thead = mainTable.querySelector('thead');
    if (thead) {
      let headersHtml = `
        <tr>
          <th>Rank</th>
          <th>Roll Number</th>
          <th>Name</th>
          <th>Branch</th>
          <th>Batch</th>
          <th>Total Score</th>
          <th>LeetCode</th>
          <th>HackerRank</th>
          <th>Codeforces</th>
          <th>GFG</th>
          <th>CodeChef</th>
          <th>GitHub</th>
      `;
      titles.forEach(t => {
        headersHtml += `<th>${escapeHtml(t.title.toUpperCase())}</th>`;
      });
      if (titles.length === 0) {
        headersHtml += `<th>INTERNSHIPS</th>`;
      }
      headersHtml += `</tr>`;
      thead.innerHTML = headersHtml;
    }
  }

  // 2. Rebuild branch standings table headers
  const branchTable = document.getElementById('table-principal-branch-students')?.closest('table');
  if (branchTable) {
    const thead = branchTable.querySelector('thead');
    if (thead) {
      let headersHtml = `
        <tr>
          <th>Rank</th>
          <th>Roll Number</th>
          <th>Name</th>
          <th>Batch</th>
          <th>Total Score</th>
          <th>LeetCode</th>
          <th>HackerRank</th>
          <th>Codeforces</th>
          <th>GFG</th>
          <th>CodeChef</th>
          <th>GitHub</th>
      `;
      titles.forEach(t => {
        headersHtml += `<th>${escapeHtml(t.title.toUpperCase())}</th>`;
      });
      if (titles.length === 0) {
        headersHtml += `<th>INTERNSHIPS</th>`;
      }
      headersHtml += `</tr>`;
      thead.innerHTML = headersHtml;
    }
  }

  // 3. Rebuild IC Overview table headers
  const icTable = document.getElementById('ic-overview-tbody')?.closest('table');
  if (icTable) {
    const thead = icTable.querySelector('thead');
    if (thead) {
      let headersHtml = `
        <tr>
          <th>Roll</th>
          <th>Name</th>
          <th>Branch</th>
          <th>Batch</th>
      `;
      titles.forEach(t => {
        headersHtml += `<th>${escapeHtml(t.title.toUpperCase())}</th>`;
      });
      if (titles.length === 0) {
        headersHtml += `<th>INTERNSHIPS</th>`;
      }
      headersHtml += `</tr>`;
      thead.innerHTML = headersHtml;
    }
  }

  // 4. Rebuild Admin Users table headers
  const adminUsersTable = document.getElementById('admin-users-tbody')?.closest('table');
  if (adminUsersTable) {
    const thead = adminUsersTable.querySelector('thead');
    if (thead) {
      let headersHtml = `
        <tr>
          <th>Roll</th>
          <th>Name</th>
          <th>Branch</th>
          <th>Batch</th>
          <th>Score</th>
          <th>LeetCode</th>
          <th>HackerRank</th>
          <th>Codeforces</th>
          <th>GFG</th>
          <th>CodeChef</th>
          <th>GitHub</th>
      `;
      titles.forEach(t => {
        headersHtml += `<th>${escapeHtml(t.title.toUpperCase())}</th>`;
      });
      if (titles.length === 0) {
        headersHtml += `<th>INTERNSHIPS</th>`;
      }
      headersHtml += `<th>Actions</th></tr>`;
      thead.innerHTML = headersHtml;
    }
  }
}

// Utility: escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function loadGlobalInternshipData() {
  try {
    const res = await fetch('/api/internships/overview');
    if (res.ok) {
      const data = await res.json();
      icOverviewData = data;
      internshipTitlesDb = data.titles || [];
      studentSubmissionsDb = data.submissions || [];
      rebuildAllTableHeaders();
    }
  } catch (err) {
    console.error('Error pre-loading internship data:', err);
  }
}


// ========== V2: CUSTOM MULTISELECT JS AND WINDOW BINDINGS ==========
function getMultiselectValues(optionsId) {
  const optionsDiv = document.getElementById(optionsId);
  if (!optionsDiv) return 'ALL';
  const checkedBoxes = Array.from(optionsDiv.querySelectorAll('input[type="checkbox"]:checked'));
  const values = checkedBoxes.map(cb => cb.value);
  if (values.includes('ALL')) return 'ALL';
  if (values.length === 0) return 'ALL';
  return values.join(',');
}

function toggleMultiselect(optionsId, event) {
  if (event) event.stopPropagation();
  document.querySelectorAll('.multiselect-options').forEach(el => {
    if (el.id !== optionsId) el.classList.remove('open');
  });
  const el = document.getElementById(optionsId);
  if (el) el.classList.toggle('open');
}

function handleMultiselectAll(allCb, optionsId, labelId, noun) {
  const optionsDiv = document.getElementById(optionsId);
  if (!optionsDiv) return;
  const checkboxes = optionsDiv.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach(cb => {
    if (cb !== allCb) {
      cb.checked = false;
    }
  });
  if (!allCb.checked) {
    allCb.checked = true;
  }
  document.getElementById(labelId).textContent = `All ${noun}`;
}

function handleMultiselectChange(optionsId, labelId, noun) {
  const optionsDiv = document.getElementById(optionsId);
  if (!optionsDiv) return;
  const allCb = optionsDiv.querySelector('input[value="ALL"]');
  const checkedBoxes = Array.from(optionsDiv.querySelectorAll('input[type="checkbox"]:checked')).filter(cb => cb.value !== 'ALL');
  
  if (checkedBoxes.length > 0) {
    if (allCb) allCb.checked = false;
    const labelText = checkedBoxes.map(cb => cb.value).join(', ');
    document.getElementById(labelId).textContent = labelText;
  } else {
    if (allCb) allCb.checked = true;
    document.getElementById(labelId).textContent = `All ${noun}`;
  }
}

// Close dropdowns on clicking outside
document.addEventListener('click', () => {
  document.querySelectorAll('.multiselect-options').forEach(el => el.classList.remove('open'));
});

// Expose internal functions to the global window object for inline onclick attributes
window.deleteInternshipTitle = deleteInternshipTitle;
window.deleteInternshipItem = deleteInternshipItem;
window.removeDraftItem = removeDraftItem;
window.adminEditInternshipSubmission = adminEditInternshipSubmission;
window.toggleMultiselect = toggleMultiselect;
window.handleMultiselectAll = handleMultiselectAll;
window.handleMultiselectChange = handleMultiselectChange;

// ========== V2: TOGGLE COLLAPSE FUNCTION ==========
function toggleInternshipCardCollapse(titleId, btn) {
  const card = btn.closest('.internship-title-card');
  if (!card) return;
  const grid = card.querySelector('.internship-items-grid');
  const submitBtn = card.querySelector('.btn-internship-submit');
  const icon = btn.querySelector('i');
  
  if (grid.style.display === 'none') {
    grid.style.display = '';
    if (submitBtn) submitBtn.style.display = '';
    if (icon) {
      icon.className = 'fa-solid fa-chevron-up';
    }
  } else {
    grid.style.display = 'none';
    if (submitBtn) submitBtn.style.display = 'none';
    if (icon) {
      icon.className = 'fa-solid fa-chevron-down';
    }
  }
}
window.toggleInternshipCardCollapse = toggleInternshipCardCollapse;

// ========== V2: EDIT PUBLISHED TITLE & ADD ITEMS ==========
async function editPublishedTitle(titleId, currentTitle) {
  const newTitle = prompt('Edit Title Name (leave blank or cancel to keep current):', currentTitle);
  const coordinatorName = currentUser ? currentUser.name : 'Coordinator';

  if (newTitle !== null && newTitle.trim() !== '' && newTitle.trim() !== currentTitle) {
    try {
      const res = await fetch(`/api/internships/titles/${titleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim(), coordinator: coordinatorName })
      });
      if (!res.ok) {
        const errData = await res.json();
        alert(errData.error || 'Failed to update title.');
      }
    } catch (err) {
      console.error('Update title error:', err);
      alert('Failed to update title.');
    }
  }

  const newItemName = prompt('Add a new internship entry (company/project) to this title (leave blank or cancel to skip):');
  if (newItemName !== null && newItemName.trim() !== '') {
    try {
      const res = await fetch(`/api/internships/titles/${titleId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newItemName.trim() })
      });
      if (!res.ok) {
        const errData = await res.json();
        alert(errData.error || 'Failed to add item.');
      }
    } catch (err) {
      console.error('Add item error:', err);
      alert('Failed to add item.');
    }
  }

  await loadInternshipTitles();
}
window.editPublishedTitle = editPublishedTitle;

// ========== V2: CSV EXPORTS AND INTERNSHIP UTILITIES ==========
function getStudentInternshipsText(studentRoll) {
  const titlesSource = internshipTitlesDb.length > 0 ? internshipTitlesDb : (icOverviewData.titles || []);
  const submissionsSource = studentSubmissionsDb.length > 0 ? studentSubmissionsDb : (icOverviewData.submissions || []);

  const studentSubs = submissionsSource.filter(s => s.student_roll === studentRoll && s.submitted);
  if (studentSubs.length === 0) return 'None';

  return studentSubs.map(sub => {
    const title = titlesSource.find(t => t.id === sub.title_id);
    if (!title) return '';
    const itemIds = sub.item_ids ? sub.item_ids.split(',').filter(Boolean).map(Number) : [];
    const items = (title.items || []).filter(it => itemIds.includes(it.id));
    const itemsText = items.map(it => it.name).join('; ');
    return `${title.title} (${itemsText || 'None'})`;
  }).filter(Boolean).join(' | ');
}

function handleICCSVDownload() {
  const { submissions = [], titles = [], students = [] } = icOverviewData;
  const branchF = document.getElementById('ic-ov-filter-branch')?.value || 'ALL';
  const batchF = document.getElementById('ic-ov-filter-batch')?.value || 'ALL';
  const search = (document.getElementById('ic-ov-search')?.value || '').toLowerCase().trim();

  let filteredStudents = students;
  if (branchF !== 'ALL') filteredStudents = filteredStudents.filter(s => s.branch === branchF);
  if (batchF !== 'ALL') filteredStudents = filteredStudents.filter(s => String(s.batchYear) === batchF || String(s.batch_year) === batchF);
  if (search) filteredStudents = filteredStudents.filter(s =>
    (s.roll || '').toLowerCase().includes(search) ||
    (s.name || '').toLowerCase().includes(search)
  );

  const submissionsMap = {};
  submissions.forEach(sub => {
    if (sub.submitted) {
      if (!submissionsMap[sub.student_roll]) {
        submissionsMap[sub.student_roll] = {};
      }
      submissionsMap[sub.student_roll][sub.title_id] = sub;
    }
  });

  let rows = filteredStudents.filter(student => submissionsMap[student.roll]);

  const titleF = document.getElementById('ic-ov-filter-title')?.value || 'ALL';
  if (titleF !== 'ALL') {
    rows = rows.filter(student => submissionsMap[student.roll] && submissionsMap[student.roll][Number(titleF)]);
  }

  // Build CSV Header
  let titleHeaders = titles.map(t => `"${t.title.toUpperCase()}"`).join(',');
  let csvContent = `Roll Number,Name,Branch,Batch,${titleHeaders}\n`;

  rows.forEach(student => {
    const roll = student.roll;
    const name = student.name || '--';
    const branch = student.branch || '--';
    const batchYear = student.batchYear || student.batch_year || '--';

    let titleValues = [];
    titles.forEach(title => {
      const sub = submissionsMap[roll] ? submissionsMap[roll][title.id] : null;
      if (!sub) {
        titleValues.push('—');
      } else {
        const itemIds = sub.item_ids ? sub.item_ids.split(',').filter(Boolean).map(Number) : [];
        const submittedItems = (title.items || []).filter(it => itemIds.includes(it.id));
        const itemsText = submittedItems.map(it => it.name).join('; ') || 'None';
        titleValues.push(itemsText);
      }
    });

    let rowValues = titleValues.map(v => `"${v}"`).join(',');
    csvContent += `"${roll}","${name}","${branch}","${batchYear}",${rowValues}\n`;
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'internship_coordinator_overview_report.csv');
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
window.getStudentInternshipsText = getStudentInternshipsText;
window.handleICCSVDownload = handleICCSVDownload;
