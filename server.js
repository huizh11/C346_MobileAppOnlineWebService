const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(express.json());
const port = process.env.PORT || 3000;

app.use(cors());

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
    try {
        const { email, password } = req.body;

        // 1. Validate input
        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required" });
        }

        // 2. Find user in database
        const [rows] = await db.execute(
            "SELECT id, name, email, password FROM User WHERE email = ?",
            [email]
        );

        // 3. Check if user exists
        if (rows.length === 0) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const user = rows[0];

        // 4. Compare password
        if (password !== user.password) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        // 5. Ensure JWT_SECRET exists
        if (!JWT_SECRET) {
            console.error("JWT_SECRET is not set");
            return res.status(500).json({ error: "Server misconfiguration" });
        }

        // 6. Generate JWT
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: "1h" }
        );

        // 7. Send token
        return res.json({ token });

    } catch (err) {
        console.error("Login route error:", err);
        return res.status(500).json({ error: "Server error" });
    }
});



function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    // 1. Check header exists
    if (!authHeader) {
        return res.status(401).json({ error: "Authorization header missing" });
    }

    // 2. Check format: Bearer <token>
    const parts = authHeader.split(" ");

    if (parts.length !== 2) {
        return res.status(401).json({ error: "Invalid authorization format" });
    }

    const type = parts[0];
    const token = parts[1];

    if (type !== "Bearer") {
        return res.status(401).json({ error: "Authorization type must be Bearer" });
    }

    // 3. Check JWT secret
    if (!JWT_SECRET) {
        console.error("JWT_SECRET is not set");
        return res.status(500).json({ error: "Server misconfiguration" });
    }

    // 4. Verify token
    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        // 5. Attach user info to request
        req.user = decoded;

        // 6. Continue
        next();
    } catch (err) {
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