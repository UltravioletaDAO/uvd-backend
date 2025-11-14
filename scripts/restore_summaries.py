#!/usr/bin/env python3
"""
Restore old stream summaries from S3 versions
Restores 59 old summaries by copying their old versions back as current objects
"""

import json
import boto3
import sys
from datetime import datetime

# Configuration
BUCKET = 'ultravioletadao'
INDEX_FILE = 'index_es_old.json'  # In same directory as script
REGION = 'us-east-1'

# Initialize S3 client
s3 = boto3.client('s3', region_name=REGION)

def list_object_versions(key):
    """Get all versions of an S3 object, including delete markers"""
    try:
        response = s3.list_object_versions(
            Bucket=BUCKET,
            Prefix=key
        )
        return {
            'versions': response.get('Versions', []),
            'delete_markers': response.get('DeleteMarkers', [])
        }
    except Exception as e:
        print(f"[ERROR] Error listing versions for {key}: {e}")
        return {'versions': [], 'delete_markers': []}

def restore_old_version(key, version_id):
    """Copy an old version back as the current version"""
    try:
        # Copy the old version to itself (makes it current)
        s3.copy_object(
            Bucket=BUCKET,
            CopySource={
                'Bucket': BUCKET,
                'Key': key,
                'VersionId': version_id
            },
            Key=key
        )
        return True
    except Exception as e:
        print(f"[ERROR] Error restoring {key}: {e}")
        return False

def main():
    print("[RESTORE] Starting restoration of old stream summaries...")

    # Read old index
    print(f"[RESTORE] Reading old index from {INDEX_FILE}")
    try:
        with open(INDEX_FILE, 'r', encoding='utf-8') as f:
            old_index = json.load(f)
    except Exception as e:
        print(f"[ERROR] Failed to read index file: {e}")
        sys.exit(1)

    streams = old_index.get('streams', [])
    print(f"[RESTORE] Found {len(streams)} streams in old index")

    restored = 0
    failed = 0
    skipped = 0

    for i, stream in enumerate(streams, 1):
        video_id = stream.get('video_id')
        streamer = stream.get('streamer')
        fecha = stream.get('fecha_stream')

        if not all([video_id, streamer, fecha]):
            print(f"[WARN] [{i}/{len(streams)}] Skipping stream with missing metadata")
            skipped += 1
            continue

        # Construct S3 key
        key = f"stream-summaries/{streamer}/{fecha}/{video_id}.es.json"

        print(f"\n[{i}/{len(streams)}] Processing: {key}")

        # Get versions and delete markers
        result = list_object_versions(key)
        versions = result['versions']
        delete_markers = result['delete_markers']

        if not versions:
            print(f"[WARN] No versions found, file might not exist")
            skipped += 1
            continue

        # Check if there's a delete marker
        has_delete_marker = any(dm.get('IsLatest', False) for dm in delete_markers)

        if not has_delete_marker and len(versions) == 1:
            print(f"[OK] Already current (no delete marker)")
            restored += 1
            continue

        if has_delete_marker:
            print(f"[INFO] File is deleted (delete marker exists)")

        # Find the actual file version (not a delete marker)
        # Get the most recent non-deleted version
        file_version = None
        for v in versions:
            if not v.get('IsDeleteMarker', False):
                file_version = v
                break

        if not file_version:
            print(f"[WARN] No file version found (only delete markers)")
            skipped += 1
            continue

        version_id = file_version['VersionId']
        version_date = file_version['LastModified']

        print(f"[RESTORE] Found version: {version_id} from {version_date}")
        print(f"[RESTORE] Restoring...")

        if restore_old_version(key, version_id):
            print(f"[OK] Restored successfully")
            restored += 1
        else:
            print(f"[ERROR] Restoration failed")
            failed += 1

    # Summary
    print("\n" + "="*60)
    print("RESTORATION SUMMARY")
    print("="*60)
    print(f"[OK] Restored: {restored}")
    print(f"[WARN] Skipped:  {skipped}")
    print(f"[ERROR] Failed:   {failed}")
    print(f"[INFO] Total:    {len(streams)}")
    print("="*60)

    if restored > 0:
        print(f"\n[SUCCESS] Successfully restored {restored} summaries!")
        print("[INFO] Next step: Regenerate index_es.json with all restored summaries")

    return 0 if failed == 0 else 1

if __name__ == '__main__':
    sys.exit(main())
