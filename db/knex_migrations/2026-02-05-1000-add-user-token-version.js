exports.up = function (knex) {
    return knex.schema.alterTable("user", function (table) {
        table.integer("token_version").notNullable().defaultTo(0);
    });
};

exports.down = function (knex) {
    return knex.schema.alterTable("user", function (table) {
        table.dropColumn("token_version");
    });
};
