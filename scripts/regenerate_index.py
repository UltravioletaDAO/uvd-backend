#!/usr/bin/env python3
"""
Regenerate stream summaries index from S3
Scans S3 for all summary files and rebuilds index_es.json
"""

import json
import boto3
import sys
from datetime import datetime

# Configuration
BUCKET = 'ultravioletadao'
PREFIX = 'stream-summaries/'
REGION = 'us-east-1'
OUTPUT_FILE = 'index_es_new.json'

# Initialize S3 client
s3 = boto3.client('s3', region_name=REGION)

def list_all_summaries():
    """List all summary JSON files in S3"""
    print("[INDEX] Scanning S3 for summary files...")

    summaries = []
    paginator = s3.get_paginator('list_objects_v2')

    for page in paginator.paginate(Bucket=BUCKET, Prefix=PREFIX):
        if 'Contents' not in page:
            continue

        for obj in page['Contents']:
            key = obj['Key']

            # Skip index files and non-JSON files
            if 'index_' in key or not key.endswith('.es.json'):
                continue

            # Parse key: stream-summaries/{streamer}/{fecha}/{video_id}.es.json
            parts = key.split('/')
            if len(parts) != 4:
                continue

            streamer = parts[1]
            fecha = parts[2]
            filename = parts[3]
            video_id = filename.replace('.es.json', '')

            summaries.append({
                'key': key,
                'streamer': streamer,
                'fecha_stream': fecha,
                'video_id': video_id,
                'last_modified': obj['LastModified']
            })

    print(f"[INDEX] Found {len(summaries)} summary files")
    return summaries

def fetch_summary_metadata(key):
    """Fetch summary file and extract metadata"""
    try:
        response = s3.get_object(Bucket=BUCKET, Key=key)
        content = response['Body'].read().decode('utf-8')
        data = json.loads(content)

        return {
            'titulo': data.get('titulo_stream') or data.get('titulo') or 'Sin título',
            'duracion': data.get('duracion') or data.get('duracion_minutos') or 'N/A',
            'thumbnail_url': data.get('thumbnail_url', '')
        }
    except Exception as e:
        print(f"[WARN] Could not fetch metadata for {key}: {e}")
        return {
            'titulo': 'Sin título',
            'duracion': 'N/A',
            'thumbnail_url': ''
        }

def regenerate_index():
    """Regenerate the index file"""
    print("[INDEX] Starting index regeneration...")

    # Get all summaries
    summaries = list_all_summaries()

    if not summaries:
        print("[ERROR] No summaries found in S3")
        return False

    # Sort by date (most recent first)
    summaries.sort(key=lambda s: s['fecha_stream'], reverse=True)

    # Build index entries
    streams = []

    for i, summary in enumerate(summaries, 1):
        print(f"[{i}/{len(summaries)}] Processing {summary['video_id']}...")

        # Fetch metadata from the actual file
        metadata = fetch_summary_metadata(summary['key'])

        entry = {
            'video_id': summary['video_id'],
            'streamer': summary['streamer'],
            'titulo': metadata['titulo'],
            'fecha_stream': summary['fecha_stream'],
            'duracion': metadata['duracion'],
            'thumbnail_url': metadata['thumbnail_url']
        }

        streams.append(entry)

    # Create index structure
    index = {
        'ultima_actualizacion': datetime.now().strftime('%Y-%m-%d'),
        'total_streams': len(streams),
        'streams': streams
    }

    # Save to file
    print(f"\n[INDEX] Writing index to {OUTPUT_FILE}...")
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False, indent=2)

    print(f"[SUCCESS] Index regenerated with {len(streams)} streams")
    print(f"[INFO] File saved to: {OUTPUT_FILE}")

    return True

def upload_to_s3():
    """Upload the new index to S3"""
    index_key = 'stream-summaries/index_es.json'

    print(f"\n[UPLOAD] Uploading {OUTPUT_FILE} to s3://{BUCKET}/{index_key}...")

    try:
        s3.upload_file(
            OUTPUT_FILE,
            BUCKET,
            index_key,
            ExtraArgs={'ContentType': 'application/json'}
        )
        print(f"[SUCCESS] Index uploaded to S3")
        return True
    except Exception as e:
        print(f"[ERROR] Failed to upload: {e}")
        return False

def main():
    print("[INDEX] ===== Stream Summaries Index Regeneration =====\n")

    # Regenerate index
    if not regenerate_index():
        sys.exit(1)

    # Ask user if they want to upload
    print("\n" + "="*60)
    response = input("Upload to S3? (yes/no): ").strip().lower()

    if response in ['yes', 'y']:
        if upload_to_s3():
            print("\n[SUCCESS] Index regeneration complete!")
        else:
            print("\n[ERROR] Upload failed")
            sys.exit(1)
    else:
        print(f"\n[INFO] Index saved locally as {OUTPUT_FILE}")
        print("[INFO] Upload manually with:")
        print(f"  aws s3 cp {OUTPUT_FILE} s3://{BUCKET}/stream-summaries/index_es.json")

    return 0

if __name__ == '__main__':
    sys.exit(main())
