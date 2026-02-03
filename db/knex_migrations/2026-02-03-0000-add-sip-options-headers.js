exports.up = function (knex) {
    return knex.schema.alterTable("monitor", function (table) {
        table.string("sip_from", 255).defaultTo(null);
        table.string("sip_contact", 255).defaultTo(null);
        table.string("sip_user_agent", 255).defaultTo(null);
    });
};

exports.down = function (knex) {
    return knex.schema.alterTable("monitor", function (table) {
        table.dropColumn("sip_from");
        table.dropColumn("sip_contact");
        table.dropColumn("sip_user_agent");
    });
};
