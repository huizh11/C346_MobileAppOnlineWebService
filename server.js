const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// ===============================
// Middleware
// ===============================
app.use(express.json());
app.use(cors());

// ===============================
// Database config
// ===============================
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    waitForConnections: true,
    connectionLimit: 100,
    queueLimit: 0,
};

// ===============================
// Root health check (REQUIRED)
// ===============================
app.get('/', (req, res) => {
    res.send('Tree API running');
});

// ===============================
// Routes
// ===============================

// Get all trees
app.get('/trees', async (req, res) => {
    try {
        const connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute('SELECT * FROM Tree');
        res.json(rows);
        await connection.end();
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error for all trees' });
    }
});

// Add tree
app.post('/addtree', async (req, res) => {
    const { region, tree_count, severity } = req.body;

    try {
        const connection = await mysql.createConnection(dbConfig);
        await connection.execute(
            'INSERT INTO Tree (region, tree_count, severity) VALUES (?, ?, ?)',
            [region, tree_count, severity]
        );
        res.status(201).json({ message: 'Tree added successfully!' });
        await connection.end();
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error - could not add tree' });
    }
});

// Update tree
app.put('/updatetree/:id', async (req, res) => {
    const { id } = req.params;
    const { region, tree_count, severity } = req.body;

    try {
        const connection = await mysql.createConnection(dbConfig);
        await connection.execute(
            'UPDATE Tree SET region=?, tree_count=?, severity=? WHERE id=?',
            [region, tree_count, severity, id]
        );
        res.json({ message: `Tree ${id} updated successfully!` });
        await connection.end();
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: `Server error - could not update tree ${id}` });
    }
});

// Delete tree
app.delete('/deletetree/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const connection = await mysql.createConnection(dbConfig);
        await connection.execute('DELETE FROM Tree WHERE id=?', [id]);
        res.json({ message: `Tree ${id} deleted successfully!` });
        await connection.end();
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: `Server error - could not delete tree ${id}` });
    }
});

// ===============================
// Start server
// ===============================
app.listen(port, () => {
    console.log('Server running on port', port);
});
