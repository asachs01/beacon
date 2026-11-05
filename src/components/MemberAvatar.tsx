/**
 * Renders a family member's photo when they have one, otherwise their emoji.
 *
 * Sized to fill its container by default so it can drop into the existing
 * avatar wrappers (which already set the circle size, border and tint); pass
 * `size` for inline usage in text rows.
 */
import { useState } from 'react';
import { resolveMemberPhoto } from '../utils/member-photo';
import type { FamilyMember } from '../types/family';

type MemberAvatarSource = Pick<FamilyMember, 'avatar' | 'photo' | 'name'>;

export interface MemberAvatarProps {
  member: MemberAvatarSource | null;
  /** Emoji shown when there is no member or no photo. */
  fallback?: string;
  /** Fixed pixel size for inline use; omit to fill the parent. */
  size?: number;
  className?: string;
}

export function MemberAvatar({
  member,
  fallback = '\u{1F464}',
  size,
  className,
}: MemberAvatarProps) {
  const [failed, setFailed] = useState(false);
  const style = size ? { width: size, height: size } : undefined;
  const photo = member?.photo;

  if (!member || !photo || failed) {
    return (
      <span className={className} style={style} aria-hidden="true">
        {member?.avatar ?? fallback}
      </span>
    );
  }

  return (
    <img
      className={`member-photo ${className ?? ''}`}
      style={style}
      src={resolveMemberPhoto(photo)}
      alt={member.name}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
