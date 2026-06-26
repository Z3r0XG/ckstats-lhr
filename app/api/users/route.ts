import { NextResponse } from 'next/server';

import { updateSingleUser } from '../../../lib/api';
import { getDb } from '../../../lib/db';
import { User } from '../../../lib/entities/User';
import { validateBitcoinAddress } from '../../../utils/validateBitcoinAddress';

// Anti-spam guard on new-user activation: at most USER_SIGNUP_LIMIT new users may be created within
// the trailing USER_SIGNUP_WINDOW_SECONDS. Operator-tunable; defaults suit a single pool and can be
// raised for higher-traffic (e.g. combined multi-region) deployments.
const SIGNUP_LIMIT = Number(process.env.USER_SIGNUP_LIMIT) || 30;
const SIGNUP_WINDOW_SECONDS =
  Number(process.env.USER_SIGNUP_WINDOW_SECONDS) || 180;

export async function POST(request: Request) {
  try {
    const { address } = await request.json();

    if (!validateBitcoinAddress(address)) {
      return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
    }

    const db = await getDb();
    const userRepository = db.getRepository(User);

    const existingUser = await userRepository.findOne({
      where: { address },
    });

    if (existingUser) {
      return NextResponse.json(
        { message: 'Already in database' },
        { status: 200 }
      );
    }

    // Compute the trailing window in SQL with now() so the comparison uses the same clock that
    // stamped "createdAt". A JS Date param here would be skewed against the tz-naive timestamp
    // column on a non-UTC database (the window stretched by the server's UTC offset), wrongly
    // counting hours of users as "recent" and 429-ing legitimate activations.
    const recentUsersCount = await userRepository
      .createQueryBuilder('user')
      .where(
        'user."createdAt" >= now() - (interval \'1 second\' * (:secs)::int)',
        { secs: SIGNUP_WINDOW_SECONDS }
      )
      .getCount();

    if (recentUsersCount >= SIGNUP_LIMIT) {
      return NextResponse.json(
        { error: 'Too many users created recently, please try again later.' },
        { status: 429 }
      );
    }

    const user = userRepository.create({
      address,
      isActive: true,
      isPublic: true,
      lastActivatedAt: new Date(),
      updatedAt: new Date().toISOString(),
    });

    await userRepository.save(user);

    updateSingleUser(address);

    const serializedUser = JSON.parse(
      JSON.stringify(user, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value
      )
    );

    return NextResponse.json(serializedUser);
  } catch (error) {
    console.error('Error adding user:', error);
    if (error.code === '23505' && error.detail?.includes('address')) {
      return NextResponse.json(
        { error: 'Address already exists' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
