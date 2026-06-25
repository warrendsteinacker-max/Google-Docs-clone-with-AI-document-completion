// Main API entry point
module.exports = (req, res) => {
  res.status(200).json({ message: 'API is running' });
};
