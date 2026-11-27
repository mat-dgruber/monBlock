Start-Sleep -Seconds 15
Set-Content -Path 'C:\spike\task-done.txt' -Value (Get-Date).ToString('o')
