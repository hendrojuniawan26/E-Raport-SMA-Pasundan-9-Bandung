import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type {
  GradeNotification,
  GradeNotificationType,
  RealtimeConnectionStatus,
  UserRole,
} from '../types/raport';

const REALTIME_CHANNEL_NAME = 'eraport-grade-notifications';

let activeChannel: RealtimeChannel | null = null;
let activeChannelSubscribed = false;

export interface PostgresStudentGradeRow {
  id?: string;
  student_id?: string;
  subject_id?: string;
  nilai_akhir?: number;
  predikat?: string;
  updated_at?: string;
}

export interface PostgresGradeNotificationRow {
  id?: string;
  type?: string;
  class_id?: string;
  class_name?: string;
  subject_id?: string;
  subject_name?: string;
  subject_code?: string;
  student_id?: string | null;
  student_name?: string | null;
  student_count?: number | null;
  nilai_akhir?: number | null;
  predikat?: string | null;
  teacher_id?: string | null;
  teacher_name?: string;
  actor_role?: string;
  message?: string;
  created_at?: string;
}

function isValidRole(value: unknown): value is UserRole {
  return value === 'admin' || value === 'guru' || value === 'wali_kelas';
}

function isValidNotificationType(value: unknown): value is GradeNotificationType {
  return value === 'single_grade' || value === 'batch_grade' || value === 'submission_sent';
}

function isValidPredikat(value: unknown): value is 'A' | 'B' | 'C' | 'D' {
  return value === 'A' || value === 'B' || value === 'C' || value === 'D';
}

export function sanitizeIncomingNotification(raw: unknown): GradeNotification | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const id = typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : '';
  const classId = typeof obj.classId === 'string' && obj.classId.trim() ? obj.classId.trim() : '';
  const subjectId =
    typeof obj.subjectId === 'string' && obj.subjectId.trim() ? obj.subjectId.trim() : '';
  const message = typeof obj.message === 'string' && obj.message.trim() ? obj.message.trim() : '';

  if (!id || !classId || !subjectId || !message) return null;

  return {
    id,
    type: isValidNotificationType(obj.type) ? obj.type : 'single_grade',
    classId,
    className: typeof obj.className === 'string' ? obj.className.trim() : '',
    subjectId,
    subjectName: typeof obj.subjectName === 'string' ? obj.subjectName.trim() : '',
    subjectCode: typeof obj.subjectCode === 'string' ? obj.subjectCode.trim() : '',
    studentId: typeof obj.studentId === 'string' ? obj.studentId.trim() : undefined,
    studentName: typeof obj.studentName === 'string' ? obj.studentName.trim() : undefined,
    studentCount:
      typeof obj.studentCount === 'number' && Number.isFinite(obj.studentCount)
        ? obj.studentCount
        : undefined,
    nilaiAkhir:
      typeof obj.nilaiAkhir === 'number' && Number.isFinite(obj.nilaiAkhir)
        ? obj.nilaiAkhir
        : undefined,
    predikat: isValidPredikat(obj.predikat) ? obj.predikat : undefined,
    teacherId: typeof obj.teacherId === 'string' ? obj.teacherId.trim() : undefined,
    teacherName:
      typeof obj.teacherName === 'string' && obj.teacherName.trim()
        ? obj.teacherName.trim()
        : 'Guru Mata Pelajaran',
    actorRole: isValidRole(obj.actorRole) ? obj.actorRole : 'guru',
    message,
    createdAt:
      typeof obj.createdAt === 'string' && obj.createdAt
        ? obj.createdAt
        : new Date().toISOString(),
    read: false,
  };
}

function mapNotificationRow(row: PostgresGradeNotificationRow): GradeNotification | null {
  return sanitizeIncomingNotification({
    id: row.id,
    type: row.type,
    classId: row.class_id,
    className: row.class_name,
    subjectId: row.subject_id,
    subjectName: row.subject_name,
    subjectCode: row.subject_code,
    studentId: row.student_id ?? undefined,
    studentName: row.student_name ?? undefined,
    studentCount:
      row.student_count !== null && row.student_count !== undefined
        ? Number(row.student_count)
        : undefined,
    nilaiAkhir:
      row.nilai_akhir !== null && row.nilai_akhir !== undefined
        ? Number(row.nilai_akhir)
        : undefined,
    predikat: row.predikat ?? undefined,
    teacherId: row.teacher_id ?? undefined,
    teacherName: row.teacher_name,
    actorRole: row.actor_role,
    message: row.message,
    createdAt: row.created_at,
  });
}

export function subscribeGradeRealtimeNotifications(params: {
  client: SupabaseClient;
  onBroadcastNotification: (notification: GradeNotification) => void;
  onPostgresGradeChange: (row: PostgresStudentGradeRow) => void;
  onPostgresNotificationInsert: (notification: GradeNotification) => void;
  onStatusChange: (status: RealtimeConnectionStatus) => void;
}): () => void {
  const {
    client,
    onBroadcastNotification,
    onPostgresGradeChange,
    onPostgresNotificationInsert,
    onStatusChange,
  } = params;

  onStatusChange('connecting');

  const channel = client.channel(REALTIME_CHANNEL_NAME, {
    config: {
      broadcast: { self: false },
    },
  });

  activeChannel = channel;
  activeChannelSubscribed = false;

  channel
    .on('broadcast', { event: 'grade_notification' }, (msg) => {
      const parsed = sanitizeIncomingNotification(msg?.payload);
      if (parsed) {
        onBroadcastNotification(parsed);
      }
    })
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'student_grades' },
      (payload) => {
        const record = (payload.new || {}) as PostgresStudentGradeRow;
        if (record && record.student_id && record.subject_id) {
          onPostgresGradeChange(record);
        }
      }
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'grade_notifications' },
      (payload) => {
        const mapped = mapNotificationRow((payload.new || {}) as PostgresGradeNotificationRow);
        if (mapped) {
          onPostgresNotificationInsert(mapped);
        }
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        activeChannelSubscribed = true;
        onStatusChange('connected');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        activeChannelSubscribed = false;
        onStatusChange('disconnected');
      } else {
        onStatusChange('connecting');
      }
    });

  return () => {
    if (activeChannel === channel) {
      activeChannel = null;
      activeChannelSubscribed = false;
    }
    client.removeChannel(channel).catch(() => {});
    onStatusChange('disconnected');
  };
}

export async function publishGradeRealtimeNotification(
  client: SupabaseClient,
  notification: GradeNotification
): Promise<void> {
  try {
    if (activeChannel && activeChannelSubscribed) {
      await activeChannel.send({
        type: 'broadcast',
        event: 'grade_notification',
        payload: notification,
      });
    } else {
      const tempChannel = client.channel(REALTIME_CHANNEL_NAME, {
        config: { broadcast: { self: false } },
      });
      await new Promise<void>((resolve) => {
        const timer = window.setTimeout(() => {
          client.removeChannel(tempChannel).catch(() => {});
          resolve();
        }, 2500);
        tempChannel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            window.clearTimeout(timer);
            await tempChannel
              .send({
                type: 'broadcast',
                event: 'grade_notification',
                payload: notification,
              })
              .catch(() => {});
            await client.removeChannel(tempChannel).catch(() => {});
            resolve();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            window.clearTimeout(timer);
            client.removeChannel(tempChannel).catch(() => {});
            resolve();
          }
        });
      });
    }
  } catch {
    // ignore transient realtime broadcast errors
  }

  // Best-effort persistent insert into grade_notifications table if provisioned
  try {
    await client.from('grade_notifications').insert({
      id: notification.id,
      type: notification.type,
      class_id: notification.classId,
      class_name: notification.className,
      subject_id: notification.subjectId,
      subject_name: notification.subjectName,
      subject_code: notification.subjectCode,
      student_id: notification.studentId || null,
      student_name: notification.studentName || null,
      student_count: notification.studentCount ?? null,
      nilai_akhir: notification.nilaiAkhir ?? null,
      predikat: notification.predikat || null,
      teacher_id: notification.teacherId || null,
      teacher_name: notification.teacherName,
      actor_role: notification.actorRole,
      message: notification.message,
      created_at: notification.createdAt,
    });
  } catch {
    // table may not be created yet; broadcast still delivered live
  }
}

export async function fetchRecentSupabaseNotifications(
  client: SupabaseClient,
  limit = 25
): Promise<GradeNotification[]> {
  try {
    const { data, error } = await client
      .from('grade_notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !Array.isArray(data)) return [];
    return data
      .map((row) => mapNotificationRow(row as PostgresGradeNotificationRow))
      .filter((item): item is GradeNotification => item !== null);
  } catch {
    return [];
  }
}
