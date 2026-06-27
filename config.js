window.APP_CONFIG = {
  // Automatically switch between local development and production Render URL.
  // Replace the Render URL below with your actual deployed Render Web Service URL.
  API_BASE: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? ''
    : 'https://idealcodetracker-backend.onrender.com'
};
