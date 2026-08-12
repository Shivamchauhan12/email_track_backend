const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  getContacts,
  createContact,
  createBulkContacts,
  updateContact,
  deleteContact
} = require('../controllers/contactController');

router.get('/', authenticate, getContacts);
router.post('/', authenticate, createContact);
router.post('/bulk', authenticate, createBulkContacts);
router.put('/:id', authenticate, updateContact);
router.delete('/:id', authenticate, deleteContact);

module.exports = router;
