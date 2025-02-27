/**
 * View Edit Router
 * @category server
 * @module routes/viewedit
 * @subcategory routes
 */

const Router = require("express-promise-router");

const {
  renderForm,
  mkTable,
  link,
  //post_btn,
  //post_delete_btn,
  post_dropdown_item,
  renderBuilder,
  settingsDropdown,
} = require("@saltcorn/markup");
const {
  //span,
  //h5,
  h4,
  //nbsp,
  p,
  a,
  div,
  //button,
  text,
} = require("@saltcorn/markup/tags");

const { getState } = require("@saltcorn/data/db/state");
const { isAdmin, error_catcher } = require("./utils.js");
const Form = require("@saltcorn/data/models/form");
const Field = require("@saltcorn/data/models/field");
const Table = require("@saltcorn/data/models/table");
const View = require("@saltcorn/data/models/view");
const Workflow = require("@saltcorn/data/models/workflow");
const User = require("@saltcorn/data/models/user");
const Page = require("@saltcorn/data/models/page");
const db = require("@saltcorn/data/db");

const { add_to_menu } = require("@saltcorn/admin-models/models/pack");
const { editRoleForm } = require("../markup/forms.js");

/**
 * @type {object}
 * @const
 * @namespace vieweditRouter
 * @category server
 * @subcategory routes
 */
const router = new Router();
module.exports = router;

/**
 * @param {object} view
 * @param {object[]} roles
 * @param {object} req
 * @returns {Form}
 */
const editViewRoleForm = (view, roles, req) =>
  editRoleForm({
    url: `/viewedit/setrole/${view.id}`,
    current_role: view.min_role,
    roles,
    req,
  });

/**
 * @param {object} view
 * @param {object} req
 * @returns {div}
 */
const view_dropdown = (view, req) =>
  settingsDropdown(`dropdownMenuButton${view.id}`, [
    a(
      {
        class: "dropdown-item",
        href: `/view/${encodeURIComponent(view.name)}`,
      },
      '<i class="fas fa-running"></i>&nbsp;' + req.__("Run")
    ),
    a(
      {
        class: "dropdown-item",
        href: `/viewedit/edit/${encodeURIComponent(view.name)}`,
      },
      '<i class="fas fa-edit"></i>&nbsp;' + req.__("Edit")
    ),
    post_dropdown_item(
      `/viewedit/add-to-menu/${view.id}`,
      '<i class="fas fa-bars"></i>&nbsp;' + req.__("Add to menu"),
      req
    ),
    post_dropdown_item(
      `/viewedit/clone/${view.id}`,
      '<i class="far fa-copy"></i>&nbsp;' + req.__("Duplicate"),
      req
    ),
    div({ class: "dropdown-divider" }),
    post_dropdown_item(
      `/viewedit/delete/${view.id}`,
      '<i class="far fa-trash-alt"></i>&nbsp;' + req.__("Delete"),
      req,
      true,
      view.name
    ),
  ]);

/**
 * @name get
 * @function
 * @memberof module:routes/viewedit~vieweditRouter
 * @function
 */
router.get(
  "/",
  isAdmin,
  error_catcher(async (req, res) => {
    var orderBy = "name";
    if (req.query._sortby === "viewtemplate") orderBy = "viewtemplate";

    var views = await View.find({}, { orderBy, nocase: true });
    const tables = await Table.find();
    const getTable = (tid) => tables.find((t) => t.id === tid).name;
    views.forEach((v) => {
      if (v.table_id) v.table = getTable(v.table_id);
      else if (v.exttable_name) v.table = v.exttable_name;
      else v.table = "";
    });
    if (req.query._sortby === "table")
      views.sort((a, b) =>
        a.table.toLowerCase() > b.table.toLowerCase() ? 1 : -1
      );
    const roles = await User.get_roles();

    const viewMarkup =
      views.length > 0
        ? mkTable(
            [
              {
                label: req.__("Name"),
                key: (r) => link(`/view/${encodeURIComponent(r.name)}`, r.name),
                sortlink: `javascript:set_state_field('_sortby', 'name')`,
              },
              // description - currently I dont want to show description in view list
              // because description can be long
              /*
              {
                  label: req.__("Description"),
                  key: "description",
                  // this is sorting by column
                  sortlink: `javascript:set_state_field('_sortby', 'description')`,
              },
              */
              // template
              {
                label: req.__("Template"),
                key: "viewtemplate",
                sortlink: `javascript:set_state_field('_sortby', 'viewtemplate')`,
              },
              {
                label: req.__("Table"),
                key: (r) => link(`/table/${r.table}`, r.table),
                sortlink: `javascript:set_state_field('_sortby', 'table')`,
              },
              {
                label: req.__("Role to access"),
                key: (row) => editViewRoleForm(row, roles, req),
              },
              {
                label: "",
                key: (r) =>
                  link(
                    `/viewedit/config/${encodeURIComponent(r.name)}`,
                    req.__("Configure")
                  ),
              },
              {
                label: "",
                key: (r) => view_dropdown(r, req),
              },
            ],
            views,
            { hover: true }
          )
        : div(
            h4(req.__("No views defined")),
            p(req.__("Views define how table rows are displayed to the user"))
          );
    res.sendWrap(req.__(`Views`), {
      above: [
        {
          type: "breadcrumbs",
          crumbs: [{ text: req.__("Views") }],
        },
        {
          type: "card",
          title: req.__("Your views"),
          contents: [
            viewMarkup,
            tables.length > 0
              ? a(
                  { href: `/viewedit/new`, class: "btn btn-primary" },
                  req.__("Create view")
                )
              : p(
                  req.__(
                    "You must create at least one table before you can create views."
                  )
                ),
          ],
        },
      ],
    });
  })
);

/**
 * @param {object} o
 * @param {function} f
 * @returns {object}
 */
const mapObjectValues = (o, f) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v)]));

/**
 * @param {object} req
 * @param {object} tableOptions
 * @param {object[]} roles
 * @param {object[]} pages
 * @param {object} values
 * @returns {Form}
 */
const viewForm = async (req, tableOptions, roles, pages, values) => {
  const isEdit =
    values && values.id && !getState().getConfig("development_mode", false);
  const hasTable = Object.entries(getState().viewtemplates)
    .filter(([k, v]) => !v.tableless)
    .map(([k, v]) => k);
  const slugOptions = await Table.allSlugOptions();
  return new Form({
    action: "/viewedit/save",
    submitLabel: req.__("Configure") + " &raquo;",
    blurb: req.__("First, please give some basic information about the view."),
    fields: [
      new Field({
        label: req.__("View name"),
        name: "name",
        type: "String",
        sublabel: req.__(
          "The view name will appear as the title of pop-ups showing this view, and in the URL when it is shown alone."
        ),
      }),
      new Field({
        label: req.__("Description"),
        name: "description",
        type: "String",
        sublabel: req.__(
          "Description allows you to give more information about the view."
        ),
      }),
      new Field({
        label: req.__("Template"),
        name: "viewtemplate",
        input_type: "select",
        sublabel: req.__("Views are based on a view template"),
        options: Object.keys(getState().viewtemplates),
        attributes: {
          explainers: mapObjectValues(
            getState().viewtemplates,
            ({ description }) => description
          ),
        },
        disabled: isEdit,
      }),
      new Field({
        label: req.__("Table"),
        name: "table_name",
        input_type: "select",
        sublabel: req.__("Display data from this table"),
        options: tableOptions,
        disabled: isEdit,
        showIf: { viewtemplate: hasTable },
      }),
      new Field({
        name: "min_role",
        label: req.__("Minimum role"),
        sublabel: req.__("Role required to run view"),
        input_type: "select",
        required: true,
        options: roles.map((r) => ({ value: r.id, label: r.role })),
      }),
      new Field({
        name: "default_render_page",
        label: req.__("Show on page"),
        sublabel: req.__(
          "Requests to render this view directly will instead show the chosen page, if any. The chosen page should embed this view. Use this to decorate the view with additional elements."
        ),
        input_type: "select",
        options: [
          { value: "", label: "" },
          ...pages.map((p) => ({ value: p.name, label: p.name })),
        ],
      }),
      new Field({
        name: "slug",
        label: req.__("Slug"),
        sublabel: req.__("Field that can be used for a prettier URL structure"),
        type: "String",
        attributes: {
          calcOptions: [
            "table_name",
            mapObjectValues(slugOptions, (lvs) => lvs.map((lv) => lv.label)),
          ],
        },
        showIf: { viewtemplate: hasTable },
      }),
      ...(isEdit
        ? [
            new Field({
              name: "viewtemplate",
              input_type: "hidden",
            }),
            new Field({
              name: "table_name",
              input_type: "hidden",
            }),
          ]
        : []),
    ],
    values,
  });
};

/**
 * @name get/edit/:viewname
 * @function
 * @memberof module:routes/viewedit~vieweditRouter
 * @function
 */
router.get(
  "/edit/:viewname",
  isAdmin,
  error_catcher(async (req, res) => {
    const { viewname } = req.params;

    var viewrow = await View.findOne({ name: viewname });
    if (!viewrow) {
      req.flash("error", `View not found: ${text(viewname)}`);
      res.redirect("/viewedit");
      return;
    }
    const tables = await Table.find_with_external();
    const currentTable = tables.find(
      (t) => t.id === viewrow.table_id || t.name === viewrow.exttable_name
    );
    viewrow.table_name = currentTable && currentTable.name;
    if (viewrow.slug && currentTable) {
      const slugOptions = await currentTable.slug_options();
      const slug = slugOptions.find((so) => so.label === viewrow.slug.label);
      if (slug) viewrow.slug = slug.label;
    }
    const tableOptions = tables.map((t) => t.name);
    const roles = await User.get_roles();
    const pages = await Page.find();
    const form = await viewForm(req, tableOptions, roles, pages, viewrow);
    form.hidden("id");
    res.sendWrap(req.__(`Edit view`), {
      above: [
        {
          type: "breadcrumbs",
          crumbs: [
            { text: req.__("Views"), href: "/viewedit" },
            { text: `${viewname}` },
          ],
        },
        {
          type: "card",
          title: req.__(`Edit %s view`, viewname),
          contents: renderForm(form, req.csrfToken()),
        },
      ],
    });
  })
);

/**
 * @name get/new
 * @function
 * @memberof module:routes/viewedit~vieweditRouter
 * @function
 */
router.get(
  "/new",
  isAdmin,
  error_catcher(async (req, res) => {
    const tables = await Table.find_with_external();
    const tableOptions = tables.map((t) => t.name);
    const roles = await User.get_roles();
    const pages = await Page.find();
    const form = await viewForm(req, tableOptions, roles, pages);
    if (req.query && req.query.table) {
      form.values.table_name = req.query.table;
    }
    res.sendWrap(req.__(`Create view`), {
      above: [
        {
          type: "breadcrumbs",
          crumbs: [
            { text: req.__("Views"), href: "/viewedit" },
            { text: req.__("Create") },
          ],
        },
        {
          type: "card",
          title: req.__(`Create view`),
          contents: renderForm(form, req.csrfToken()),
        },
      ],
    });
  })
);

/**
 * @name post/save
 * @function
 * @memberof module:routes/viewedit~vieweditRouter
 * @function
 */
router.post(
  "/save",
  isAdmin,
  error_catcher(async (req, res) => {
    const tables = await Table.find_with_external();
    const tableOptions = tables.map((t) => t.name);
    const roles = await User.get_roles();
    const pages = await Page.find();
    const form = await viewForm(req, tableOptions, roles, pages);
    const result = form.validate(req.body);

    const sendForm = (form) => {
      res.sendWrap(req.__(`Edit view`), {
        above: [
          {
            type: "breadcrumbs",
            crumbs: [
              { text: req.__("Views"), href: "/viewedit" },
              { text: req.__("Edit") },
            ],
          },
          {
            type: "card",
            title: req.__(`Edit view`),
            contents: renderForm(form, req.csrfToken()),
          },
        ],
      });
    };

    if (result.success) {
      if (result.success.name.replace(" ", "") === "") {
        form.errors.name = req.__("Name required");
        form.hasErrors = true;
        sendForm(form);
      } else {
        const existing_view = await View.findOne({ name: result.success.name });
        if (typeof existing_view !== "undefined")
          if (req.body.id != existing_view.id) {
            // may be need !== but doesnt work
            form.errors.name = req.__("A view with this name already exists");
            form.hasErrors = true;
            sendForm(form);
            return;
          }

        const v = result.success;
        if (v.table_name) {
          const table = await Table.findOne({ name: v.table_name });
          if (table && table.id) {
            v.table_id = table.id;
          } else if (table && table.external) v.exttable_name = v.table_name;
        }
        if (v.table_id) {
          const table = await Table.findOne({ id: v.table_id });
          const slugOptions = await table.slug_options();
          const slug = slugOptions.find((so) => so.label === v.slug);
          v.slug = slug || null;
        }
        const table = await Table.findOne({ name: v.table_name });
        delete v.table_name;
        if (req.body.id) {
          await View.update(v, +req.body.id);
        } else {
          const vt = getState().viewtemplates[v.viewtemplate];
          if (vt.initial_config) v.configuration = await vt.initial_config(v);
          else v.configuration = {};
          await View.create(v);
        }
        res.redirect(`/viewedit/config/${encodeURIComponent(v.name)}`);
      }
    } else {
      sendForm(form);
    }
  })
);

/**
 * @param {object} view
 * @param {Workflow} wf
 * @param {object} wfres
 * @param {object} req
 * @param {object} res
 * @returns {void}
 */
const respondWorkflow = (view, wf, wfres, req, res) => {
  const wrap = (contents, noCard) => ({
    above: [
      {
        type: "breadcrumbs",
        crumbs: [
          { text: req.__("Views"), href: "/viewedit" },
          { href: `/viewedit/edit/${view.name}`, text: view.name },
          { workflow: wf, step: wfres },
        ],
      },
      {
        type: noCard ? "container" : "card",
        title: wfres.title,
        contents,
      },
    ],
  });
  if (wfres.flash) req.flash(wfres.flash[0], wfres.flash[1]);
  if (wfres.renderForm)
    res.sendWrap(
      {
        title: req.__(`View configuration`),
        headers: [
          {
            script: `/static_assets/${db.connectObj.version_tag}/jquery-menu-editor.min.js`,
          },
          {
            script: `/static_assets/${db.connectObj.version_tag}/iconset-fontawesome5-3-1.min.js`,
          },
          {
            script: `/static_assets/${db.connectObj.version_tag}/bootstrap-iconpicker.js`,
          },
          {
            css: `/static_assets/${db.connectObj.version_tag}/bootstrap-iconpicker.min.css`,
          },
        ],
      },
      wrap(renderForm(wfres.renderForm, req.csrfToken()))
    );
  else if (wfres.renderBuilder) {
    wfres.renderBuilder.options.view_id = view.id;
    res.sendWrap(
      req.__(`View configuration`),
      wrap(renderBuilder(wfres.renderBuilder, req.csrfToken()), true)
    );
  } else res.redirect(wfres.redirect);
};

/**
 * @name get/config/:name
 * @function
 * @memberof module:routes/viewedit~vieweditRouter
 * @function
 */
router.get(
  "/config/:name",
  isAdmin,
  error_catcher(async (req, res) => {
    const { name } = req.params;

    const view = await View.findOne({ name });
    if (!view) {
      req.flash("error", `View not found: ${text(name)}`);
      res.redirect("/viewedit");
      return;
    }
    const configFlow = await view.get_config_flow(req);
    const wfres = await configFlow.run(
      {
        table_id: view.table_id,
        exttable_name: view.exttable_name,
        viewname: name,
        ...view.configuration,
      },
      req
    );
    respondWorkflow(view, configFlow, wfres, req, res);
  })
);

/**
 * @name post/config/:name
 * @function
 * @memberof module:routes/viewedit~vieweditRouter
 * @function
 */
router.post(
  "/config/:name",
  isAdmin,
  error_catcher(async (req, res) => {
    const { name } = req.params;

    const view = await View.findOne({ name });
    const configFlow = await view.get_config_flow(req);
    const wfres = await configFlow.run(req.body, req);
    respondWorkflow(view, configFlow, wfres, req, res);
  })
);

/**
 * @name post/add-to-menu/:id
 * @function
 * @memberof module:routes/viewedit~vieweditRouter
 * @function
 */
router.post(
  "/add-to-menu/:id",
  isAdmin,
  error_catcher(async (req, res) => {
    const { id } = req.params;
    const view = await View.findOne({ id });
    await add_to_menu({
      label: view.name,
      type: "View",
      min_role: view.min_role,
      viewname: view.name,
    });
    req.flash(
      "success",
      req.__(
        "View %s added to menu. Adjust access permissions in Settings &raquo; Menu",
        view.name
      )
    );
    res.redirect(`/viewedit`);
  })
);

/**
 * @name post/clone/:id
 * @function
 * @memberof module:routes/viewedit~vieweditRouter
 * @function
 */
router.post(
  "/clone/:id",
  isAdmin,
  error_catcher(async (req, res) => {
    const { id } = req.params;
    const view = await View.findOne({ id });
    const newview = await view.clone();
    req.flash(
      "success",
      req.__("View %s duplicated as %s", view.name, newview.name)
    );
    res.redirect(`/viewedit`);
  })
);

/**
 * @name post/delete/:id
 * @function
 * @memberof module:routes/viewedit~vieweditRouter
 * @function
 */
router.post(
  "/delete/:id",
  isAdmin,
  error_catcher(async (req, res) => {
    const { id } = req.params;
    await View.delete({ id });
    req.flash("success", req.__("View deleted"));
    res.redirect(`/viewedit`);
  })
);

/**
 * @name post/savebuilder/:id
 * @function
 * @memberof module:routes/viewedit~vieweditRouter
 * @function
 */
router.post(
  "/savebuilder/:id",
  isAdmin,
  error_catcher(async (req, res) => {
    const { id } = req.params;

    if (id && req.body) {
      const exview = await View.findOne({ id });
      let newcfg = { ...exview.configuration, ...req.body };
      await View.update({ configuration: newcfg }, +id);
      res.json({ success: "ok" });
    } else {
      res.json({ error: "no view" });
    }
  })
);

/**
 * @name post/setrole/:id
 * @function
 * @memberof module:routes/viewedit~vieweditRouter
 * @function
 */
router.post(
  "/setrole/:id",
  isAdmin,
  error_catcher(async (req, res) => {
    const { id } = req.params;
    const role = req.body.role;
    await View.update({ min_role: role }, +id);
    const view = await View.findOne({ id });
    const roles = await User.get_roles();
    const roleRow = roles.find((r) => r.id === +role);
    if (roleRow && view)
      req.flash(
        "success",
        req.__(`Minimum role for %s updated to %s`, view.name, roleRow.role)
      );
    else req.flash("success", req.__(`Minimum role updated`));

    res.redirect("/viewedit");
  })
);
