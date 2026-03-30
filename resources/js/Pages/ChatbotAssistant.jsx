import React from 'react';
import PageContainer from '@/Components/PageContainer';
import ChatbotAssistantPanel from '@/Components/ChatbotAssistantPanel';

export default function ChatbotAssistant({ auth }) {
    return (
        <PageContainer
            auth={auth}
            title="Trợ lý AI"
            description="Trợ lý AI đã được chuyển sang dạng popup góc phải để đồng nhất với chat nội bộ. Trang này giữ lại như một chế độ đầy đủ để kiểm tra và hỗ trợ khi cần."
            stats={[]}
        >
            <ChatbotAssistantPanel auth={auth} />
        </PageContainer>
    );
}
