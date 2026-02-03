exports.up = function (knex) {
    return knex.schema.alterTable("monitor", function (table) {
        table.boolean("sip_rport").notNullable().defaultTo(true);
    });
};

exports.down = function (knex) {
    return knex.schema.alterTable("monitor", function (table) {
        table.dropColumn("sip_rport");
    });
};
