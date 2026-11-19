"""Generate Swagger entity models from prisma/schema.prisma (re-run after schema changes)."""
import re, sys
root = sys.argv[1]
schema = open(f'{root}/prisma/schema.prisma').read()
enums = set(re.findall(r'^enum (\w+) \{', schema, re.M))
models = dict(re.findall(r'^model (\w+) \{\n(.*?)\n\}', schema, re.M | re.S))
SKIP_MODELS = {'Counter', 'MfaTotp', 'MfaRecoveryCode', 'MfaAttempt', 'MfaChallenge', 'UserToken', 'RefreshToken'}
SECRET = {'passwordHash', 'tokenHash', 'secret', 'pendingSecret', 'hash', 'credentialVersion', 'storageKey', 'dedupeKey', 'mfaResetAt'}
SCALAR = {'String': ('string', None), 'Int': ('integer', None), 'BigInt': ('integer', 'int64'),
          'Float': ('number', None), 'Decimal': ('string', 'decimal'), 'Boolean': ('boolean', None),
          'DateTime': ('string', 'date-time'), 'Json': ('object', None)}
out = ["// Generated from prisma/schema.prisma by scripts/generate-swagger-models.py. Do not edit.",
       "// Response shapes for Swagger; relation fields are present only where an endpoint includes them.",
       "import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';",
       "import * as E from '../../generated/prisma/enums.js';", ""]
used_enums = set()
order = [m for m in models if m not in SKIP_MODELS]
for name in order:
    body = models[name]
    out.append(f"/** {name} record. */")
    out.append(f"export class {name}Model {{")
    for line in body.split('\n'):
        line = line.strip()
        if not line or line.startswith('//') or line.startswith('@@'):
            continue
        m = re.match(r'(\w+)\s+(\w+)(\[\])?(\?)?(.*)', line)
        if not m: continue
        field, typ, arr, opt, rest = m.groups()
        if field in SECRET: continue
        doc = ''
        cm = re.search(r'//\s*(.*)$', rest)
        if cm: doc = cm.group(1).strip().replace('*/', '')
        nullable = bool(opt)
        if typ in SCALAR:
            t, fmt = SCALAR[typ]
            opts = [f"type: '{t}'"]
            if fmt: opts.append(f"format: '{fmt}'")
            if t == 'object': opts.append('additionalProperties: true')
            if arr: opts = [f"type: '{t}'", "isArray: true"] + ([f"format: '{fmt}'"] if fmt else [])
            if nullable: opts.append('nullable: true')
            if doc: opts.append(f"description: {doc!r}")
            ts = {'string':'string','integer':'number','number':'number','boolean':'boolean','object':'Record<string, unknown>'}[t]
            if typ == 'DateTime': ts = 'Date'
            if typ == 'Decimal':
                ts = 'string'
                opts.append("example: '650.00'")
            ts = ts + ('[]' if arr else '') + (' | null' if nullable else '')
            out.append(f"  @ApiProperty({{ {', '.join(opts)} }})")
            out.append(f"  {field}!: {ts};")
        elif typ in enums:
            used_enums.add(typ)
            opts = [f"enum: E.{typ}", f"enumName: '{typ}'"]
            if arr: opts.append('isArray: true')
            if nullable: opts.append('nullable: true')
            if doc: opts.append(f"description: {doc!r}")
            ts = f"E.{typ}" + ('[]' if arr else '') + (' | null' if nullable else '')
            out.append(f"  @ApiProperty({{ {', '.join(opts)} }})")
            out.append(f"  {field}!: {ts};")
        elif typ in models and typ not in SKIP_MODELS:
            opts = [f"type: () => {typ}Model"]
            if arr: opts.append('isArray: true')
            if nullable: opts.append('nullable: true')
            out.append(f"  @ApiPropertyOptional({{ {', '.join(opts)}, description: 'Included by some endpoints' }})")
            out.append(f"  {field}?: {typ}Model{'[]' if arr else ''}{' | null' if nullable else ''};")
    out.append("}")
    out.append("")
open(f'{root}/src/common/swagger/entities.dto.ts', 'w').write("\n".join(out))
print(len(order), 'models')
