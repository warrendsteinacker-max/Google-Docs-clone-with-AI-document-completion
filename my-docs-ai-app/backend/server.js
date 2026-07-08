const app = require('./api/index.js');
const PORT = process.env.PORT || 3001;

app.listen(5000, () => {
  console.log(`✅ Backend running at http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health`);
});