"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dbOperations = exports.db = void 0;
exports.hydrateTicket = hydrateTicket;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables from parent root or current folder
const projectRoot = path_1.default.resolve(__dirname, '../../../');
const envPath = fs_1.default.existsSync(path_1.default.join(projectRoot, '.env'))
    ? path_1.default.join(projectRoot, '.env')
    : path_1.default.resolve(__dirname, '../../.env');
dotenv_1.default.config({ path: envPath });
// Database path resolution - anchored to projectRoot so all processes access the exact same DB
const dbPathSetting = process.env.DATABASE_PATH || './data/support_sense.db';
const resolvedDbPath = path_1.default.isAbsolute(dbPathSetting)
    ? dbPathSetting
    : path_1.default.resolve(projectRoot, dbPathSetting);
// Ensure target directory exists
const dbDir = path_1.default.dirname(resolvedDbPath);
if (!fs_1.default.existsSync(dbDir)) {
    fs_1.default.mkdirSync(dbDir, { recursive: true });
}
// Initialize SQLite connection
exports.db = new better_sqlite3_1.default(resolvedDbPath);
exports.db.pragma('journal_mode = WAL');
// Execute initial schema
const schemaCandidates = [
    path_1.default.resolve(__dirname, 'schema.sql'),
    path_1.default.resolve(__dirname, '../../src/db/schema.sql'),
    path_1.default.resolve(process.cwd(), 'src/db/schema.sql'),
    path_1.default.resolve(process.cwd(), 'backend/src/db/schema.sql'),
];
let schemaSql = '';
for (const candidate of schemaCandidates) {
    if (fs_1.default.existsSync(candidate)) {
        schemaSql = fs_1.default.readFileSync(candidate, 'utf-8');
        break;
    }
}
if (!schemaSql) {
    // Built-in fallback schema to guarantee tables exist
    schemaSql = `
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_email TEXT NOT NULL,
      text TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('new', 'auto_resolved', 'escalated', 'human_resolved')),
      ai_answer TEXT,
      confidence REAL,
      sources_json TEXT DEFAULT '[]',
      summary TEXT,
      tags_json TEXT DEFAULT '[]',
      urgency TEXT DEFAULT 'medium' CHECK(urgency IN ('low', 'medium', 'high')),
      human_reply TEXT,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_start TEXT NOT NULL,
      week_end TEXT NOT NULL,
      report_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS feedback_pairs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      ticket_text TEXT NOT NULL,
      human_reply TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
    CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);
  `;
}
exports.db.exec(schemaSql);
// Helper to hydrate JSON columns
function hydrateTicket(row) {
    if (!row)
        return null;
    let sources = [];
    let tags = [];
    try {
        sources = row.sources_json ? JSON.parse(row.sources_json) : [];
    }
    catch {
        sources = [];
    }
    try {
        tags = row.tags_json ? JSON.parse(row.tags_json) : [];
    }
    catch {
        tags = [];
    }
    return {
        ...row,
        sources,
        tags,
    };
}
// Database helper functions
exports.dbOperations = {
    createInitialTicket(customer_email, text) {
        const now = new Date().toISOString();
        const stmt = exports.db.prepare(`
      INSERT INTO tickets (customer_email, text, status, sources_json, tags_json, urgency, created_at)
      VALUES (?, ?, 'new', '[]', '[]', 'medium', ?)
    `);
        const info = stmt.run(customer_email, text, now);
        return Number(info.lastInsertRowid);
    },
    updateTicketWithAiResult(params) {
        const resolvedAt = params.status === 'auto_resolved' ? new Date().toISOString() : null;
        const stmt = exports.db.prepare(`
      UPDATE tickets
      SET status = ?,
          ai_answer = ?,
          confidence = ?,
          sources_json = ?,
          summary = ?,
          tags_json = ?,
          urgency = ?,
          resolved_at = ?
      WHERE id = ?
    `);
        stmt.run(params.status, params.ai_answer, params.confidence, JSON.stringify(params.sources), params.summary, JSON.stringify(params.tags), params.urgency, resolvedAt, params.id);
        return exports.dbOperations.getTicketById(params.id);
    },
    getTicketById(id) {
        const stmt = exports.db.prepare('SELECT * FROM tickets WHERE id = ?');
        const row = stmt.get(id);
        return hydrateTicket(row);
    },
    listTickets(filter) {
        let query = 'SELECT * FROM tickets WHERE 1=1';
        const params = [];
        if (filter?.status && filter.status !== 'all') {
            query += ' AND status = ?';
            params.push(filter.status);
        }
        if (filter?.tag && filter.tag !== 'all') {
            query += ' AND tags_json LIKE ?';
            params.push(`%"${filter.tag}"%`);
        }
        query += ' ORDER BY id DESC';
        const rows = exports.db.prepare(query).all(...params);
        return rows.map(hydrateTicket).filter((t) => t !== null);
    },
    resolveTicketWithHumanReply(id, human_reply) {
        const now = new Date().toISOString();
        const ticket = exports.dbOperations.getTicketById(id);
        if (!ticket)
            return null;
        // Transaction for atomic update of ticket and insertion of feedback pair
        const updateTx = exports.db.transaction(() => {
            exports.db.prepare(`
        UPDATE tickets
        SET status = 'human_resolved',
            human_reply = ?,
            resolved_at = ?
        WHERE id = ?
      `).run(human_reply, now, id);
            exports.db.prepare(`
        INSERT INTO feedback_pairs (ticket_id, ticket_text, human_reply, created_at)
        VALUES (?, ?, ?, ?)
      `).run(id, ticket.text, human_reply, now);
        });
        updateTx();
        return exports.dbOperations.getTicketById(id);
    },
    saveReport(week_start, week_end, report) {
        const now = new Date().toISOString();
        const stmt = exports.db.prepare(`
      INSERT INTO reports (week_start, week_end, report_json, created_at)
      VALUES (?, ?, ?, ?)
    `);
        const info = stmt.run(week_start, week_end, JSON.stringify(report), now);
        return Number(info.lastInsertRowid);
    },
    getLatestReport() {
        const stmt = exports.db.prepare('SELECT * FROM reports ORDER BY id DESC LIMIT 1');
        const row = stmt.get();
        if (!row)
            return null;
        try {
            return {
                id: row.id,
                week_start: row.week_start,
                week_end: row.week_end,
                created_at: row.created_at,
                ...JSON.parse(row.report_json)
            };
        }
        catch {
            return null;
        }
    },
    getTicketsBetween(startDate, endDate) {
        const stmt = exports.db.prepare(`
      SELECT * FROM tickets
      WHERE created_at >= ? AND created_at <= ?
      ORDER BY id ASC
    `);
        const rows = stmt.all(startDate, endDate);
        return rows.map(hydrateTicket).filter((t) => t !== null);
    }
};
