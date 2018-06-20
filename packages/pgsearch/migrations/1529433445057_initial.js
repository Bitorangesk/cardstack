
exports.up = pgm => {
    pgm.createTable("documents", {
        type: "varchar",
        id: "varchar",
        branch: "varchar",
        search_doc: "jsonb",
        pristine_doc: "jsonb",
        upstream_doc: "jsonb",
        source: "varchar",
        generation: "bigint",
        refs: "varchar[]"
    });
    pgm.addConstraint("documents", "documents_pkey", { primaryKey: ["type", "id", "branch"]});
    pgm.createIndex("documents", "refs", { method: "GIN" });

    pgm.createTable("meta", {
        id: "varchar",
        branch: "varchar",
        params: "jsonb"
    });
    pgm.addConstraint("meta", "meta_pkey", { primaryKey: ["id", "branch"]});
};

