CREATE TABLE IF NOT EXISTS word_pairs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    word VARCHAR(80) NOT NULL UNIQUE,
    hint VARCHAR(160) NOT NULL,
    CONSTRAINT word_pairs_word_not_blank CHECK (word = btrim(word) AND length(word) > 0),
    CONSTRAINT word_pairs_hint_not_blank CHECK (hint = btrim(hint) AND length(hint) > 0),
    CONSTRAINT word_pairs_hint_differs CHECK (lower(normalize(word, NFKC)) <> lower(normalize(hint, NFKC)))
);
