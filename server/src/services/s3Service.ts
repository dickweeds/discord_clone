import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const BUCKET_NAME = process.env.SOUNDBOARD_BUCKET_NAME || '';
const REGION = process.env.SOUNDBOARD_BUCKET_REGION || process.env.AWS_REGION || 'us-east-1';

let s3Client: S3Client | null = null;

function getClient(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({ region: REGION });
  }
  return s3Client;
}

export async function getUploadUrl(
  s3Key: string,
  contentType: string,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: s3Key,
    ContentType: contentType,
  });
  return getSignedUrl(getClient(), command, { expiresIn: 900 });
}

export async function getDownloadUrl(s3Key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: s3Key,
  });
  return getSignedUrl(getClient(), command, { expiresIn: 3600 });
}

export async function deleteObject(s3Key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: s3Key,
  });
  await getClient().send(command);
}
