import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

export async function GET() {
  // Create sample Excel file
  const sampleData = [
    {
      old_host: 'imap.example.com',
      old_email: 'user@example.com',
      old_password: 'password123',
      old_port: 993,
      old_tls: true,
      new_host: 'imap.newserver.com',
      new_email: 'user@newserver.com',
      new_password: 'newpassword123',
      new_port: 993,
      new_tls: true,
      batch_size: 200,
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Migration');

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="migration-template.xlsx"',
    },
  });
}
