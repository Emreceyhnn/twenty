import { AgentChatFilePreview } from '@/ai/components/internal/AgentChatFilePreview';
import { useAgentChatAttachments } from '@/ai/hooks/useAgentChatAttachments';
import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme';

const StyledPreviewsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[1]};
  width: 100%;
`;

export const AgentChatContextPreview = () => {
  const {
    selectedFiles: agentChatSelectedFiles,
    setSelectedFiles: setAgentChatSelectedFiles,
    uploadedFiles: agentChatUploadedFiles,
    setUploadedFiles: setAgentChatUploadedFiles,
  } = useAgentChatAttachments();

  const handleRemoveUploadedFile = (fileIndex: number) => {
    setAgentChatUploadedFiles(
      agentChatUploadedFiles.filter((_, index) => fileIndex !== index),
    );
  };

  const hasFiles =
    agentChatSelectedFiles.length > 0 || agentChatUploadedFiles.length > 0;

  if (!hasFiles) {
    return null;
  }

  return (
    <StyledPreviewsContainer>
      {agentChatSelectedFiles.map((file, index) => (
        <AgentChatFilePreview
          file={file}
          key={`${index}-${file.name}`}
          onRemove={() => {
            setAgentChatSelectedFiles(
              agentChatSelectedFiles.filter(
                (selectedFile) => selectedFile !== file,
              ),
            );
          }}
          isUploading
        />
      ))}
      {agentChatUploadedFiles.map((file, index) => (
        <AgentChatFilePreview
          file={file}
          key={index}
          onRemove={() => handleRemoveUploadedFile(index)}
          isUploading={false}
        />
      ))}
    </StyledPreviewsContainer>
  );
};
