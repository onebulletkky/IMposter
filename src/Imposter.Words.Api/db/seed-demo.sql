-- Demonstration words only. Replace this pack with the authored game catalog later.
-- The application executes this script only when SeedDemoWords is true.
INSERT INTO word_pairs (word, hint) VALUES
    ('Volcano', 'Mountain'),
    ('Penguin', 'Cold'),
    ('Library', 'Quiet'),
    ('Telescope', 'Distance'),
    ('Pineapple', 'Tropical'),
    ('Submarine', 'Ocean'),
    ('Carnival', 'Celebration'),
    ('Compass', 'Direction'),
    ('Waterfall', 'River'),
    ('Orchestra', 'Music'),
    ('Lighthouse', 'Coast'),
    ('Snowflake', 'Winter')
ON CONFLICT (word) DO NOTHING;
