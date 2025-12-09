import { NextResponse } from 'next/server';
import { MoreThanOrEqual } from 'typeorm';

import { updateSingleUser } from '../../../lib/api';
import { getDb } from '../../../lib/db';
import { User } from '../../../lib/entities/User';
import { validateBitcoinAddress } from '../../../utils/validateBitcoinAddress';

export async function POST(request: Request) {
  try {
    const { address } = await request.json();

    if (!validateBitcoinAddress(address)) {
      return NextResponse.json(
        { error: 'Invalid Bitcoin address' },
        { status: 400 }
      );
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

    const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
    const recentUsersCount = await userRepository.count({
      where: {
        createdAt: MoreThanOrEqual(threeMinutesAgo),
      },
    });

    if (recentUsersCount >= 10) {
      return NextResponse.json(
        { error: 'Too many users created recently, please try again later.' },
        { status: 429 }
      );
    }

    const user = userRepository.create({
      address,
      isActive: true,
      isPublic: true,
      updatedAt: new Date().toISOString(),
    });

    await userRepository.save(user);

    updateSingleUser(address);

    // Return user data without relationships to avoid circular references
    const userResponse = {
      address: user.address,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      authorised: user.authorised?.toString() || '0', // Convert BigInt to string
      isActive: user.isActive,
      isPublic: user.isPublic,
    };

    return NextResponse.json(userResponse);
  } catch (error) {
    console.error('Error adding user:', error);
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as any).code === '23505' &&
      'detail' in error &&
      typeof (error as any).detail === 'string' &&
      (error as any).detail.includes('address')
    ) {
      return NextResponse.json(
        { error: 'Bitcoin address already exists' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
