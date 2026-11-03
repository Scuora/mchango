//! Mchango: a small fundraiser cashbook with M-Pesa capture, statement
//! reconciliation and a public transparency page.

// Amounts are written as shillings_cents, e.g. 1_500_00 for KES 1,500.00.
#![allow(clippy::inconsistent_digit_grouping)]

pub mod announcements;
pub mod api;
pub mod auth;
pub mod capture;
pub mod challenges;
pub mod clock;
pub mod config;
pub mod db;
pub mod error;
pub mod export;
pub mod history;
pub mod money;
pub mod publication;
pub mod reconciliation;
pub mod reports;
pub mod seed;
pub mod settings;
pub mod statements;
pub mod storage;
pub mod transactions;
