param([ValidateSet('read','write','delete')][string]$Operation, [string]$ProfileName)
$ErrorActionPreference = 'Stop'
if ($ProfileName -notmatch '^[A-Za-z0-9_.-]{1,80}$') { throw 'Invalid credential profile.' }
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class SmenaCredential {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct Credential {
    public UInt32 Flags; public UInt32 Type; public string TargetName; public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public UInt32 CredentialBlobSize; public IntPtr CredentialBlob; public UInt32 Persist;
    public UInt32 AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName;
  }
  [DllImport("advapi32.dll", EntryPoint="CredWriteW", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool Write(ref Credential c, UInt32 flags);
  [DllImport("advapi32.dll", EntryPoint="CredReadW", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool Read(string target, UInt32 type, UInt32 flags, out IntPtr ptr);
  [DllImport("advapi32.dll", EntryPoint="CredDeleteW", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool Delete(string target, UInt32 type, UInt32 flags);
  [DllImport("advapi32.dll")] public static extern void CredFree(IntPtr ptr);
}
'@
$credentialTarget = 'SmenaMCP/' + $ProfileName
if ($Operation -eq 'write') {
  $credentialSecret = [Console]::In.ReadToEnd().Trim()
  if ($credentialSecret -notmatch '^smena_int_[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$') { throw 'Invalid integration token.' }
  $credential = New-Object SmenaCredential+Credential
  $credential.Type = 1; $credential.TargetName = $credentialTarget; $credential.UserName = 'Smena'
  $credential.Persist = 2; $credential.CredentialBlobSize = [Text.Encoding]::Unicode.GetByteCount($credentialSecret)
  $credential.CredentialBlob = [Runtime.InteropServices.Marshal]::StringToCoTaskMemUni($credentialSecret)
  try { if (-not [SmenaCredential]::Write([ref]$credential, 0)) { throw 'Credential write failed.' } }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeCoTaskMemUnicode($credential.CredentialBlob) }
} elseif ($Operation -eq 'read') {
  $credentialPointer = [IntPtr]::Zero
  if (-not [SmenaCredential]::Read($credentialTarget, 1, 0, [ref]$credentialPointer)) { exit 2 }
  try {
    $credential = [Runtime.InteropServices.Marshal]::PtrToStructure($credentialPointer, [type][SmenaCredential+Credential])
    [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringUni($credential.CredentialBlob, $credential.CredentialBlobSize / 2))
  } finally { [SmenaCredential]::CredFree($credentialPointer) }
} else { [void][SmenaCredential]::Delete($credentialTarget, 1, 0) }
