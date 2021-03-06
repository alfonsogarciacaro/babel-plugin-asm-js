import { STDLIB_TYPES, HEAP_VIEW_TYPES } from './tables';
import { Int, Double, Float, Extern, Str, Intish, Floatish } from './types';

export const GLOBALS = new Map([...STDLIB_TYPES.entries(), ...HEAP_VIEW_TYPES.entries()]);

export function typeError(msg) {
	var e = this.errorWithNode(msg, TypeError);
	Error.captureStackTrace(e, typeError);
	throw e;
}

export function assert(cond, msg) {
	if (!cond) {
		this::typeError(`Assertion failed: ${msg}`);
	}
}

const flowToAsmMappings = {
	int: Int,
	int32: Int,
	double: Double,
	float64: Double,
	float: Float,
	float32: Float
};

export function flowToAsm() {
	var annotation = this.get('typeAnnotation');
	if (annotation.type === 'StringTypeAnnotation') {
		return Str;
	}
	this::assert(annotation.type === 'GenericTypeAnnotation', 'only generic type annotations are accepted');
	var type = annotation.node.id.name;
	this::assert(type in flowToAsmMappings, `unknown type ${type}`);
	return flowToAsmMappings[type];
}

export function getWrap(type) {
	var {node} = this;
	if (type.subtype(Int)) {
		return node._wrapFor === Int ? node : {
			type: 'BinaryExpression',
			left: node,
			operator: '|',
			right: { type: 'Literal', value: 0 },
			_wrapFor: Int
		};
	}
	if (type.subtype(Double)) {
		return node._wrapFor === Double ? node : {
			type: 'UnaryExpression',
			operator: '+',
			argument: node,
			_wrapFor: Double
		};
	}
	if (type.subtype(Float)) {
		return node._wrapFor === Float ? node : {
			type: 'CallExpression',
			callee: {
				type: 'MemberExpression',
				object: { type: 'Identifier', name: 'Math' },
				property: { type: 'Identifier', name: 'fround' }
			},
			arguments: [node],
			_wrapFor: Float
		};
	}
	if (type.subtype(Extern)) {
		return node;
	}
	this::typeError(`cannot wrap into type ${type}`);	
}

export function replaceWrap(type, force) {
	if (!force) {
		let asmType = this.getData('asmType');
		if (asmType && asmType.subtype(type)) {
			return this;
		}
	}
	this.replaceWith(this::getWrap(type));
	this.setData('asmType', type);
	return this;
}

export function unish() {
	var asmType = this.getData('asmType');
	if (asmType.equals(Intish)) {
		return this::replaceWrap(Int);
	}
	if (asmType.equals(Floatish)) {
		return this::replaceWrap(Float);
	}
	return this;
}

export function validateType(path, expectedType) {
	var type = path.getData('asmType');
	if (expectedType !== undefined) {
		path::assert(type.subtype(expectedType), `expected ${expectedType} but got ${type}`);
	}
	return type;
}
