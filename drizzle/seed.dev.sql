-- Development seed. Local only. Never run against the remote database.
DELETE FROM pricing_items; DELETE FROM views; DELETE FROM acceptances; DELETE FROM proposals; DELETE FROM sessions; DELETE FROM magic_tokens; DELETE FROM users;

INSERT INTO users (id, email, name, brand_name, brand_color, plan, created_at)
VALUES ('11111111-1111-4111-8111-111111111111', 'dev@example.com', 'Dev User', 'Northwind Studio', '#111111', 'pro', 1756944000000);

INSERT INTO proposals (id, public_id, user_id, title, client_name, client_email, currency, content, status, created_at, updated_at)
VALUES (
  '22222222-2222-4222-8222-222222222222',
  '3f7c9b1e-6d2a-4a5b-9c8d-0e1f2a3b4c5d',
  '11111111-1111-4111-8111-111111111111',
  'Website redesign for Acme Bakery',
  'Acme Bakery', 'owner@acmebakery.example',
  'CAD',
  '[{"type":"heading","props":{"level":1},"content":[{"type":"text","text":"Website redesign for Acme Bakery","styles":{}}]},{"type":"paragraph","content":[{"type":"text","text":"A fast, mobile-first site with online ordering, delivered in six weeks.","styles":{}}]},{"type":"pricingTable","props":{}},{"type":"acceptBlock","props":{}}]',
  'draft', 1756944000000, 1756944000000
);

INSERT INTO pricing_items (id, proposal_id, position, name, description, unit_amount, quantity, optional, selected_by_default, tax_rate_bps) VALUES
('a1', '22222222-2222-4222-8222-222222222222', 0, 'Design and build', 'Five pages, responsive, launched on your domain', 450000, 1, 0, 1, 1300),
('a2', '22222222-2222-4222-8222-222222222222', 1, 'Online ordering', 'Menu, cart and Stripe checkout', 180000, 1, 1, 1, 1300),
('a3', '22222222-2222-4222-8222-222222222222', 2, 'Monthly care plan', 'Updates, backups and support', 15000, 12, 1, 0, 1300);
