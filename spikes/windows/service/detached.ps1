Start-Sleep -Seconds 15
Set-Content -Path 'C:\spike\detached-done.txt' -Value (Get-Date).ToString('o')
