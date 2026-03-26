ALTER TABLE attendance
ADD UNIQUE KEY unique_attendance (employee_id, DATE);