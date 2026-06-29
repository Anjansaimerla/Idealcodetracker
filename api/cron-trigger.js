module.exports = async (req, res) => {
  try {
    const response = await fetch('https://ideal-code-tracker-backend.onrender.com/api/cron/sync?secret=ideal_code_tracker_cron_secret', {
      method: 'POST'
    });
    const data = await response.json();
    res.status(200).json({ success: true, backendResponse: data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
