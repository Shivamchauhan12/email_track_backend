const prisma = require('../config/database');

const getContacts = async (req, res) => {
  try {
    const { search, tag, page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } }
      ];
    }
    if (tag) {
      where.tags = { contains: tag, mode: 'insensitive' };
    }

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { campaigns: true } }
        }
      }),
      prisma.contact.count({ where })
    ]);

    res.json({ contacts, total, pages: Math.ceil(total / parseInt(limit)) });
  } catch (error) {
    console.error('Get contacts error:', error);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
};

const createContact = async (req, res) => {
  try {
    const { email, firstName, lastName, company, tags } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const contact = await prisma.contact.create({
      data: { email, firstName, lastName, company, tags },
    });

    res.status(201).json(contact);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Contact with this email already exists' });
    }
    res.status(500).json({ error: 'Failed to create contact' });
  }
};

const createBulkContacts = async (req, res) => {
  try {
    const { contacts } = req.body;
    if (!Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({ error: 'Contacts array required' });
    }

    const results = { created: 0, skipped: 0, errors: [] };

    for (const contactData of contacts) {
      try {
        await prisma.contact.create({
          data: {
            email: contactData.email,
            firstName: contactData.firstName,
            lastName: contactData.lastName,
            company: contactData.company,
            tags: contactData.tags
          }
        });
        results.created++;
      } catch (err) {
        if (err.code === 'P2002') {
          results.skipped++;
        } else {
          results.errors.push({ email: contactData.email, error: err.message });
        }
      }
    }

    res.status(201).json(results);
  } catch (error) {
    res.status(500).json({ error: 'Bulk import failed' });
  }
};

const updateContact = async (req, res) => {
  try {
    const { id } = req.params;
    const contact = await prisma.contact.update({
      where: { id: parseInt(id) },
      data: req.body
    });
    res.json(contact);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update contact' });
  }
};

const deleteContact = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.contact.delete({ where: { id: parseInt(id) } });
    res.json({ message: 'Contact deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete contact' });
  }
};

module.exports = { getContacts, createContact, createBulkContacts, updateContact, deleteContact };
