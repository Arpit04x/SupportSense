"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ticketsRouter = void 0;
const express_1 = require("express");
const database_1 = require("../db/database");
const escalation_1 = require("../services/escalation");
exports.ticketsRouter = (0, express_1.Router)();
/**
 * POST /api/tickets
 * Create a new ticket, tag it, attempt RAG resolution, or escalate with summary
 */
exports.ticketsRouter.post('/', async (req, res) => {
    try {
        const { customer_email, text } = req.body;
        if (!customer_email || !text) {
            res.status(400).json({ error: 'customer_email and text are required fields' });
            return;
        }
        const processedTicket = await escalation_1.escalationService.processTicket(customer_email.trim(), text.trim());
        res.status(201).json(processedTicket);
    }
    catch (err) {
        console.error('Error in POST /api/tickets:', err);
        res.status(500).json({ error: 'Failed to process ticket', details: err?.message });
    }
});
/**
 * GET /api/tickets
 * List tickets with optional status and tag filters
 */
exports.ticketsRouter.get('/', (req, res) => {
    try {
        const { status, tag } = req.query;
        const tickets = database_1.dbOperations.listTickets({
            status: typeof status === 'string' ? status : undefined,
            tag: typeof tag === 'string' ? tag : undefined,
        });
        res.json(tickets);
    }
    catch (err) {
        console.error('Error in GET /api/tickets:', err);
        res.status(500).json({ error: 'Failed to list tickets' });
    }
});
/**
 * GET /api/tickets/:id
 * Retrieve a single ticket by its ID
 */
exports.ticketsRouter.get('/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
            res.status(400).json({ error: 'Invalid ticket ID' });
            return;
        }
        const ticket = database_1.dbOperations.getTicketById(id);
        if (!ticket) {
            res.status(404).json({ error: 'Ticket not found' });
            return;
        }
        res.json(ticket);
    }
    catch (err) {
        console.error('Error in GET /api/tickets/:id:', err);
        res.status(500).json({ error: 'Failed to fetch ticket' });
    }
});
/**
 * POST /api/tickets/:id/resolve
 * Human agent submits reply to resolve an escalated ticket
 */
exports.ticketsRouter.post('/:id/resolve', (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { human_reply } = req.body;
        if (isNaN(id)) {
            res.status(400).json({ error: 'Invalid ticket ID' });
            return;
        }
        if (!human_reply || typeof human_reply !== 'string' || !human_reply.trim()) {
            res.status(400).json({ error: 'human_reply is required' });
            return;
        }
        const resolvedTicket = database_1.dbOperations.resolveTicketWithHumanReply(id, human_reply.trim());
        if (!resolvedTicket) {
            res.status(404).json({ error: 'Ticket not found' });
            return;
        }
        res.json(resolvedTicket);
    }
    catch (err) {
        console.error('Error in POST /api/tickets/:id/resolve:', err);
        res.status(500).json({ error: 'Failed to resolve ticket' });
    }
});
