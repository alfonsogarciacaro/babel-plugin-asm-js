import 'better-log/install';
import visitProgram, { ProgramState } from './program';

module.exports = function ({ Plugin, types: t }) {
	function reattach(member, newRoot) {
		if (t.isIdentifier(member)) {
			return t.memberExpression(newRoot, member);
		}
		return t.memberExpression(
			reattach(member.object, newRoot),
			member.property
		);
	}

	return new Plugin("asm-js", {
		metadata: {
			group: "builtin-modules"
		},

		visitor: {
			Program(node, parent, scope, file) {
				var directive = this.get('body.0');
				if (!directive.isExpressionStatement()) return this.skip();
				directive = directive.get('expression');
				if (!directive.isLiteral({ value: 'use asm' })) return this.skip();
				var state = new ProgramState(t);
				this::visitProgram(state);
				var funcBody = [t.expressionStatement(t.literal('use asm'))];
				if (state.stdlibImports.size) {
					funcBody.push(t.variableDeclaration('var', Array.from(
						state.stdlibImports.values(),
						({ uid, expr }) => t.variableDeclarator(uid, reattach(expr, t.identifier('stdlib')))
					)));
				}
				if (state.foreignImports.size) {
					funcBody.push(t.variableDeclaration('var', Array.from(
						state.foreignImports.values(),
						({ uid }) => t.variableDeclarator(uid, t.memberExpression(
							t.identifier('foreign'),
							uid
						))
					)));
				}
				funcBody = funcBody.concat(state.varDecls, state.funcs, state.funcTables);
				funcBody.push(t.returnStatement(t.objectExpression(Array.from(
					state.exports.values(),
					({ exported, local }) => t.property('init', exported, local)
				))));
				var func = t.functionExpression(
					t.identifier('asm'),
					[t.identifier('stdlib'), t.identifier('foreign'), t.identifier('heap')],
					t.blockStatement(funcBody)
				);
				var exportOutside = t.callExpression(func, [
					t.callExpression(file.addHelper('self-global'), []),
					t.objectExpression(Array.from(
						state.foreignImports.values(),
						({ uid, expr }) => t.property('init', uid, expr)
					)),
					t.newExpression(t.identifier('ArrayBuffer'), [t.literal(0x10000)])
				]);
				switch (file.opts.modules) {
					case 'amd':
					case 'common':
					case 'commonStrict':
					case 'umd':
						exportOutside = [
							t.expressionStatement(t.callExpression(file.addHelper('defaults'), [
								t.identifier('exports'),
								exportOutside
							]))
						];
						break;

					default:
						exportOutside = [
							t.variableDeclaration('var', [t.variableDeclarator(
								t.objectPattern(Array.from(
									state.exports.values(),
									({ exported, uid }) => t.property('init', exported, uid)
								)),
								exportOutside
							)]),
							t.exportNamedDeclaration(null, Array.from(
								state.exports.values(),
								({ uid, exported }) => t.exportSpecifier(uid, exported)
							))
						];
				}
				this.node.body = exportOutside;
			}
		}
	});
};
