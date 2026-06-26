import { defineModule } from "@runory/sdk"

// Runory Customer Management 1.1.0
// Authored via SDK defineModule — replaces hand-written YAML manifest.
// Delta vs 1.0.0: adds `industry` (select) and `website` (text) fields.
const manifest = defineModule({
  id: "runory.customer",
  name: "Customer Management",
  version: "1.1.0",
  manifestSchemaVersion: "1.0.0",
  coreCompatibility: ">=0.1.0",

  objects: [
    {
      key: "customer",
      label: "Customer",
      fields: [
        {
          key: "name",
          label: "Customer Name",
          type: "text",
          ownership: "module_owned",
          required: true,
        },
        {
          key: "email",
          label: "Email",
          type: "email",
          ownership: "module_owned",
          required: false,
        },
        {
          key: "phone",
          label: "Phone",
          type: "phone",
          ownership: "module_owned",
          required: false,
        },
        {
          key: "industry",
          label: "Industry",
          type: "select",
          ownership: "module_owned",
          required: false,
          validation: {
            options: ["technology", "finance", "retail", "healthcare", "manufacturing", "other"],
          },
        },
        {
          key: "website",
          label: "Website",
          type: "text",
          ownership: "module_owned",
          required: false,
        },
      ],
    },
  ],

  views: [
    {
      object: "customer",
      key: "customer_list",
      type: "list",
      label: "Customer List",
      config: {
        columns: [
          { field: "name", label: "Customer Name" },
          { field: "email", label: "Email" },
          { field: "phone", label: "Phone" },
          { field: "industry", label: "Industry" },
        ],
        actions: ["create", "view"],
        pageSize: 20,
      },
    },
    {
      object: "customer",
      key: "customer_form",
      type: "form",
      label: "Customer Form",
      config: {
        sections: [
          {
            title: "Basic Info",
            fields: [
              { field: "name", required: true },
              { field: "email" },
              { field: "phone" },
              { field: "industry" },
              { field: "website" },
            ],
          },
        ],
      },
    },
  ],

  permissions: [
    "customer.read",
    "customer.create",
    "customer.update",
    "customer.delete",
  ],

  migrations: {
    install: "migrations/install.sql",
    uninstallPolicy: "retain_data",
    upgrade: [
      {
        from: "1.0.0",
        to: "1.1.0",
        script: "migrations/upgrade-from-1.0.sql",
        risk: "low",
      },
    ],
  },

  ui: {
    navigation: [
      {
        label: "Customer",
        route: "/customers",
        icon: "users",
        sortOrder: 20,
      },
    ],
  },

  extensionPoints: {
    entities: [
      {
        entity: "customer",
        customFields: {
          enabled: true,
          allowedTypes: ["text", "number", "date", "select", "boolean"],
          maxFields: 50,
          reservedKeys: ["id", "name", "email", "phone", "industry", "website", "created_at", "updated_at"],
        },
        customRelations: {
          enabled: false,
        },
      },
    ],
    views: [
      {
        view: "customer_list",
        slots: [
          {
            id: "customer.list.columns",
            type: "column_group",
            allowedExtensions: ["customField"],
            risk: "low",
          },
        ],
        allowReorder: true,
        allowFilters: true,
        allowAddSection: false,
        allowAddAction: false,
        allowPageSizeChange: true,
      },
      {
        view: "customer_form",
        slots: [
          {
            id: "customer.form.basic_fields.after",
            type: "field_group",
            allowedExtensions: ["customField"],
            risk: "low",
          },
        ],
        allowReorder: false,
        allowFilters: false,
        allowAddSection: true,
        allowAddAction: true,
        allowPageSizeChange: false,
      },
    ],
  },

  upgradePolicy: {
    supportsWorkspaceExtensions: true,
    breakingChangePolicy: "manual_review",
  },

  dataOwnership: "workspace",
  uninstallRetentionPolicy: "retain_data",
})

export default manifest
