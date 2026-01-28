const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(express.json());
const port = process.env.PORT || 3000;

app.use(cors());

const DEMO_USER = {
    id: 1,
    username: "admin",
    password: "admin123",
};

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

const pool = mysql.createPool(dbConfig);

const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET;

// login
app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    if (username !== DEMO_USER.username || password !== DEMO_USER.password) {
        return res.status(401).json({ error: "Invalid credentials" });
    }
    const token = jwt.sign(
        { userId: DEMO_USER.id, username: DEMO_USER.username },
        JWT_SECRET,
        { expiresIn: "1h" },
    );

    res.json({ token });
});

function requireAuth(req, res, next) {
    const header = req.headers.authorization; // "Bearer <token>"

    if (!header) {
        return res.status(401).json({ error: "Authorization header missing" });
    }

    const [type, token] = header.split(" ");

    if (type !== "Bearer" || !token) {
        return res.status(401).json({ error: "Invalid authorization header" });
    }

    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.user = payload;
        next();
    } catch (error) {
        return res.status(401).json({ error: "Invalid or expired token" });
    }
}

app.get('/', (req, res) => {
    res.send('Tree API running');
});

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
app.post('/addtree', requireAuth, async (req, res) => {
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
app.put('/updatetree/:id',async (req, res) => {
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

app.listen(port, () => {
    console.log('Server running on port', port);
});
