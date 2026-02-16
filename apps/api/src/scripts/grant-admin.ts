import { adminAuth } from '../lib/firebase-admin';

type Args = {
  uid?: string;
  email?: string;
  revoke?: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--uid') {
      args.uid = argv[i + 1];
      i += 1;
    } else if (arg === '--email') {
      args.email = argv[i + 1];
      i += 1;
    } else if (arg === '--revoke') {
      args.revoke = true;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.uid && !args.email) {
    console.error(
      'Usage: yarn workspace api grant-admin --uid <firebaseUid> | --email <user@email.com> [--revoke]'
    );
    process.exit(1);
  }

  let uid = args.uid;
  if (!uid && args.email) {
    const userByEmail = await adminAuth.getUserByEmail(args.email);
    uid = userByEmail.uid;
  }

  if (!uid) {
    throw new Error('Unable to resolve Firebase UID');
  }

  const user = await adminAuth.getUser(uid);
  const currentClaims = user.customClaims ?? {};
  const nextClaims = args.revoke
    ? { ...currentClaims, admin: false }
    : { ...currentClaims, admin: true };

  await adminAuth.setCustomUserClaims(uid, nextClaims);

  console.log(
    `${args.revoke ? 'Revoked' : 'Granted'} admin claim for uid=${uid} (${user.email ?? 'no-email'})`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
