// Read-only route inventory. Never reads local environment files or secrets.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const routes = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.name.endsWith('.controller.ts')) inspect(file);
  }
}
function decorators(node) {
  return (ts.getDecorators(node) || []).filter(d => ts.isCallExpression(d.expression))
    .map(d => ({ name: d.expression.expression.getText(), args: d.expression.arguments.map(a => ts.isStringLiteral(a) ? a.text : a.getText()) }));
}
function inspect(file) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  for (const cls of source.statements.filter(ts.isClassDeclaration)) {
    const classDecorators = decorators(cls);
    const prefix = classDecorators.find(d => d.name === 'Controller')?.args[0];
    if (prefix === undefined) continue;
    for (const member of cls.members.filter(ts.isMethodDeclaration)) {
      const own = decorators(member);
      const verb = own.find(d => ['Get', 'Post', 'Patch', 'Put', 'Delete'].includes(d.name));
      if (!verb) continue;
      routes.push({
        method: verb.name.toUpperCase(),
        route: '/' + [prefix, verb.args[0]].filter(Boolean).join('/'),
        controller: cls.name.text,
        handler: member.name.getText(source),
        roles: (own.find(d => d.name === 'Roles') || classDecorators.find(d => d.name === 'Roles'))?.args || [],
        public: [...own, ...classDecorators].some(d => d.name === 'Public'),
        file: path.relative(root, file).replaceAll('\\', '/'),
        line: source.getLineAndCharacterOfPosition(member.getStart(source)).line + 1,
        registration: prefix === 'submissions' ? 'legacy module not imported by AppModule' : 'controller in current module tree',
      });
    }
  }
}
walk(path.join(root, 'src'));
fs.writeFileSync(path.join(__dirname, 'route-inventory.json'), JSON.stringify(routes, null, 2) + '\n');
const active = routes.filter(r => r.registration === 'controller in current module tree');
console.log(JSON.stringify({ routes: active.length, publicRoutes: active.filter(r => r.public).length,
  authenticatedMutationsWithoutRoleDecorator: active.filter(r => !r.public && r.roles.length === 0 && r.method !== 'GET').map(r => r.method + ' ' + r.route),
  note: 'No role decorator is a review signal, not automatically a vulnerability; ownership checks must also be inspected.' }, null, 2));
