#!/usr/bin/env node
// Set (or rotate) a staff account's password directly in the database —
// the email provider is not configured, so the forgot-password flow cannot
// deliver links. Works against whatever DATABASE_URL points at (prints the
// target first).
//
// Usage:
//   node scripts/set-admin-password.mjs --email krystal@flowerkreations.com.au
//   node scripts/set-admin-password.mjs --email a@b.c --password '<chosen>'
//   node scripts/set-admin-password.mjs --email a@b.c --out /path/creds.txt
//   node scripts/set-admin-password.mjs --email new@x.y --create --role admin
//
// The generated password is never printed to the terminal — it is appended
// to --out (default: ../repo-secrets-removed/new-credentials.txt) with 0600
// permissions. Weak/default passwords are rejected.
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { appendFileSync, chmodSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const email = String(arg('email') || '').trim().toLowerCase();
if (!email || !email.includes('@')) {
  console.error('usage: node scripts/set-admin-password.mjs --email <email> [--password <pw>] [--out <file>]');
  process.exit(1);
}

const OUT = resolve(arg('out') || '../repo-secrets-removed/new-credentials.txt');
const ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const generate = () => Array.from({ length: 20 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
const password = String(arg('password') || generate());

for (const banned of ['admin123', 'password', 'changeme', 'krystal123']) {
  if (password.toLowerCase() === banned) {
    console.error(`refusing to set a banned default password (${banned})`);
    process.exit(1);
  }
}
if (password.length < 12) {
  console.error('refusing: password must be at least 12 characters');
  process.exit(1);
}

const url = process.env.DATABASE_URL || '';
const target = /supabase/i.test(url) ? 'SUPABASE/PROD' : 'local DATABASE_URL';
const prisma = new PrismaClient(url ? { datasources: { db: { url } } } : {});

const hash = await bcrypt.hash(password, 10);
let user = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });
if (!user) {
  if (arg('create') === undefined) {
    console.error(`no user with email ${email} on ${target} (pass --create --role <role> to create one)`);
    await prisma.$disconnect();
    process.exit(1);
  }
  const role = String(arg('role') || 'admin');
  if (!['customer', 'staff', 'maker', 'admin', 'developer'].includes(role)) {
    console.error(`invalid role ${role}`);
    await prisma.$disconnect();
    process.exit(1);
  }
  user = await prisma.user.create({ data: { email, name: email.split('@')[0], role, password: hash }, select: { id: true, role: true } });
  console.log(`user created for ${email} (role=${user.role}) on ${target}`);
} else {
  await prisma.user.update({ where: { id: user.id }, data: { password: hash } });
}
await prisma.$disconnect();

mkdirSync(dirname(OUT), { recursive: true });
appendFileSync(OUT, `${email} | ${password} | role=${user.role} | target=${target} | ${new Date().toISOString()}\n`, { mode: 0o600 });
if (existsSync(OUT)) chmodSync(OUT, 0o600);

console.log(`password updated for ${email} (role=${user.role}) on ${target}`);
console.log(`credential written to ${OUT} (not shown here)`);
