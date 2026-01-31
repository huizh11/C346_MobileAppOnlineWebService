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

// register
app.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // 1. Validate input
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email and password are required" });
    }

    // 2. Check if email already exists
    const [existing] = await pool.execute(
      "SELECT id FROM User WHERE email = ?",
      [email]
    );

    if (existing.length > 0) {
      return res.status(409).json({ error: "Email already registered" });
    }

    // 3. Insert user into database
    const [result] = await pool.execute(
      "INSERT INTO User (name, email, password) VALUES (?, ?, ?)",
      [name, email, password]
    );

    return res.status(201).json({ message: "Registered successfully", id: result.insertId });
  } catch (err) {
    console.error("Register route error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});


// login
app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1. Validate input
        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required" });
        }

        // 2. Find user in database
        const [rows] = await pool.execute(
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


// GET all trees
app.get('/trees', async (req, res) => {
    try {
        const [rows] = await pool.execute(
            'SELECT * FROM Tree'
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error for all trees' });
    }
});

function calculateSeverity(tree_count) {
    if (tree_count <= 200) return "High";
    if (tree_count <= 500) return "Medium";
    return "Low";}

// add tree
app.post('/addtree', requireAuth, async (req, res) => {
    const { region, tree_count } = req.body;

    if (!region || tree_count == null || tree_count < 0) {
        return res.status(400).json({ error: "Invalid input" });
    }

    try {
        // 1. Try updating existing region
        const [updateResult] = await pool.execute(
            'UPDATE Tree SET tree_count = tree_count + ? WHERE region = ?',
            [tree_count, region]
        );

        // 2. If region does not exist → insert new row
        if (updateResult.affectedRows === 0) {
            const severity = calculateSeverity(tree_count);

            await pool.execute(
                'INSERT INTO Tree (region, tree_count, severity) VALUES (?, ?, ?)',
                [region, tree_count, severity]
            );

            return res.json({ message: "New region added successfully" });
        }

        // 3. If region exists → recalculate severity
        const [[row]] = await pool.execute(
            'SELECT tree_count FROM Tree WHERE region = ?',
            [region]
        );

        const severity = calculateSeverity(row.tree_count);

        await pool.execute(
            'UPDATE Tree SET severity = ? WHERE region = ?',
            [severity, region]
        );

        res.json({ message: "Tree count updated successfully" });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
});




// RESET all tree counts
app.put('/reset', requireAuth, async (req, res) => {
    try {
        await pool.execute(
            'UPDATE Tree SET tree_count = 0'
        );

        await pool.execute(
            `
            UPDATE Tree
            SET severity =
                CASE
                    WHEN tree_count < 10 THEN 'Low'
                    WHEN tree_count < 50 THEN 'Medium'
                    ELSE 'High'
                END
            `
        );

        res.json({ message: "All tree counts reset successfully" });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error - could not reset tree counts" });
    }
});



// UPDATE tree
app.put('/updatetree/:id', async (req, res) => {
    const { id } = req.params;
    const { region, tree_count } = req.body;

    if (!region || tree_count == null || tree_count < 0) {
        return res.status(400).json({ error: "Invalid input" });
    }

    let severity;
    if (tree_count < 10) {
        severity = "Low";
    } else if (tree_count < 50) {
        severity = "Medium";
    } else {
        severity = "High";
    }

    try {
        const [result] = await pool.execute(
            'UPDATE Tree SET region=?, tree_count=?, severity=? WHERE id=?',
            [region, tree_count, severity, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Tree not found" });
        }

        res.json({ message: `Tree ${id} updated successfully!` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: `Server error - could not update tree ${id}` });
    }
});


// DELETE tree
app.delete('/deletetree/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const [result] = await pool.execute(
            'DELETE FROM Tree WHERE id=?',
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Tree not found" });
        }

        res.json({ message: `Tree ${id} deleted successfully!` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: `Server error - could not delete tree ${id}` });
    }
});


app.listen(port, () => {
    console.log('Server running on port', port);
});
